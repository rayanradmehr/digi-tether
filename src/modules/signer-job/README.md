# SignerJobModule — Service Layer

## Purpose

`SignerJobService` is the **sole authority** over the lifecycle of every
`signer_jobs` row. It is the only component that may mutate the status,
claim fields, result, or error of a SignerJob. No other component may
call the repository directly for mutations.

---

## Responsibilities

1. **Create jobs** — Accept a sealed `SignerPayload` and persist a new
   `PENDING` row. Extract denormalised columns. Never build or inspect
   payload contents.

2. **Enforce the state machine** — Every lifecycle method applies
   pre-condition checks and throws a typed domain error on invalid paths.

3. **Enforce field immutability** — After creation, no mutation method
   ever includes immutable columns in its update changes object.

4. **Log every transition** — Every successful state change produces a
   structured log entry. Expiry produces a `warn`. Failure produces an `error`.

5. **Expose aggregate counters** — `countPending()` and `countClaimed()`
   for monitoring and admin dashboards.

---

## Non-Responsibilities (Strict)

This service **must never**:

- Build, parse, modify, or validate a `SignerPayload` or `signingPayload`.
- Call any `BlockchainDriver` method.
- Perform cryptographic operations.
- Communicate with the Offline Signer (HTTP, gRPC, queue).
- Call RPC nodes.
- Publish domain events or queue messages (Step 4).
- Know what `CREATE_WALLET`, `SWEEP`, or `WITHDRAW` mean at a business level.
- Import from `WalletModule`, `SweepModule`, `WithdrawalModule`, `NetworkModule`, or `TokenModule`.

---

## State Machine

```
          ┌─────────────────────────────────────────────┐
          │              createJob()                     │
          └──────────────────┬──────────────────────────┘
                             │
                             ▼
                         PENDING
                        /   │   \
               claim() /    │    \ cancel()
                      /     │     \
                     ▼      │      ▼
                 CLAIMED    │   CANCELLED (terminal)
                 /   \     │
      complete() /   fail() │ expire()
                /        \  │
               ▼          ▼ ▼
          COMPLETED     FAILED    EXPIRED
          (terminal)  (terminal) (terminal)
```

**Terminal states**: `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`.
No transition out of a terminal state is permitted under any circumstances.

---

## Permitted Transitions

| From | Operation | To | Guard |
|---|---|---|---|
| `PENDING` | `claimJob()` | `CLAIMED` | expiresAt not passed |
| `PENDING` | `cancelJob()` | `CANCELLED` | — |
| `PENDING` | `expireJob()` | `EXPIRED` | expiresAt must have passed |
| `CLAIMED` | `completeJob()` | `COMPLETED` | claimToken must match |
| `CLAIMED` | `markFailed()` | `FAILED` | — |
| `CLAIMED` | `cancelJob()` | `CANCELLED` | — |
| `CLAIMED` | `expireJob()` | `EXPIRED` | expiresAt must have passed |

---

## Forbidden Transitions

| From | Operation | Why |
|---|---|---|
| `COMPLETED` | Any mutation | Terminal — immutable |
| `FAILED` | Any mutation | Terminal — immutable |
| `EXPIRED` | Any mutation | Terminal — immutable |
| `CANCELLED` | Any mutation | Terminal — immutable |
| `PENDING` | `completeJob()` | Must be CLAIMED first |
| `PENDING` | `markFailed()` | Must be CLAIMED first |
| `CLAIMED` | `claimJob()` | Already claimed |

---

## Immutability Guarantees

Once a job row is persisted, the service **never** includes the following
fields in any `update()` call:

- `payload` (entire JSONB — contains `signingPayload`, `payloadDigest`, `integritySignature`)
- `requestId`
- `walletId`
- `networkId`
- `jobType`
- `payloadVersion`
- `protocolVersion`
- `expiresAt`
- `referenceId`
- `referenceType`
- `createdAt`

The unit tests verify this explicitly for every mutating method.

---

## Domain Errors

| Error Class | HTTP | Code | When |
|---|---|---|---|
| `SignerJobNotFoundError` | 404 | `SIGNER_JOB_NOT_FOUND` | Row not found |
| `SignerJobExpiredError` | 410 | `SIGNER_JOB_EXPIRED` | expiresAt has passed (on claim) |
| `SignerJobAlreadyClaimedError` | 409 | `SIGNER_JOB_ALREADY_CLAIMED` | Status is CLAIMED on claim attempt |
| `SignerJobInvalidStatusError` | 422 | `SIGNER_JOB_INVALID_STATUS` | Illegal state transition or guard failure |
| `SignerJobCompletedError` | 409 | `SIGNER_JOB_ALREADY_COMPLETED` | Mutation on COMPLETED job |

---

## Dependencies

| Dependency | Role |
|---|---|
| `SignerJobRepository` | Data access only — never direct TypeORM |
| `ILogger` | Structured logging for every transition |

`SignerJobService` has **no other dependencies**.

---

## Architecture References

- Phase 3.5 Architecture Document, Revision 3 (Frozen)
- ADR-JM-001 through ADR-JM-013
- Phase 3.5 Step 2 (persistence layer)
