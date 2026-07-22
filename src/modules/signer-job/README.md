# SignerJobModule

## Purpose

The `SignerJobModule` is the formal contract layer between the Digi-Tether
Blockchain Backend and the future Offline Signer (a separate Rust application).

It acts as a **passive, pull-only job queue** backed by the `signer_jobs`
PostgreSQL table. The Backend never contacts the Signer. The Signer polls,
claims, signs offline, and submits results. The Backend validates and stores
results. Everything is pull-based.

---

## What This Module Is

- A **durable job store** for cryptographic signing requests.
- A **pull-only HTTP surface** the Offline Signer polls.
- A **result receiver** that validates and persists Signer responses.
- A **domain event emitter** that notifies upstream modules when signing completes.

---

## Responsibilities

1. **Job Intake** — Accept pre-built, sealed `SignerPayload` objects from
   internal modules (Wallet, Sweep, Withdrawal) and persist them as
   `PENDING` rows in `signer_jobs`.

2. **Payload Storage and Delivery** — Store the `SignerPayload` JSONB column
   verbatim and serve it to the Signer on poll. The module is a transparent
   carrier; it never parses payload contents.

3. **Job Persistence** — Every job is a durable database row. No in-memory
   state. Jobs survive application restarts and pod failures.

4. **Signer API Surface** — Three endpoints: list available jobs, claim a
   job, submit a result. Nothing else.

5. **Result Acceptance** — Validate the `SignerResult`, transition job
   status, write the result column, emit domain events.

---

## Non-Responsibilities (Strict)

This module **must never**:

- Parse or interpret `signingPayload` bytes.
- Modify `signingPayload` in any way.
- Build, assemble, or modify a `SignerPayload` (that is `SigningPayloadBuilder`).
- Compute `payloadDigest` (that is `SigningPayloadBuilder`).
- Generate `integritySignature` directly (that is `IntegritySignatureService`).
- Call any `BlockchainDriver` method.
- Calculate nonce, gas, fee, energy, or bandwidth.
- Call RPC nodes.
- Broadcast signed transactions.
- Hold private keys.
- Know what `CREATE_WALLET`, `SWEEP`, or `WITHDRAW` mean at a business level.
- Communicate proactively with the Offline Signer.

---

## Execution Pipeline

```
Business Module (Wallet / Sweep / Withdrawal)
  ↓ calls BlockchainDriver (builds signingPayload)
  ↓
BlockchainDriver  →  signingPayload bytes (deterministic, opaque)
  ↓
SigningPayloadBuilder  →  assembles + seals SignerPayload
  ↓
IntegritySignatureService  →  generates integritySignature
  ↓
SignerJobService  →  persists SignerJob row (status = PENDING)
  ↓
Database (signer_jobs table)
  ↓  ← Signer polls
Offline Signer  →  verifies + signs + returns SignerResult
  ↓
SignerJobService  →  validates + writes result (status = COMPLETED)
  ↓
Business Module receives signer_job.completed event
  ↓
BlockchainDriver  →  broadcasts signed transaction
```

---

## Persistence Rules

| Rule | Detail |
|---|---|
| No hard deletes | `signer_jobs` rows are never physically deleted (ADR-JM-006). |
| Soft delete only | `deleted_at` column exists as a safety mechanism; not used in normal flow. |
| Optimistic locking | `@VersionColumn` prevents concurrent lost-update races. |
| FIFO polling | `findAvailable()` orders by `created_at ASC`. |
| TTL enforced | `expiresAt` is denormalised to a column for indexed cron queries. |
| Indexed status | `status` and `(status, expires_at)` are indexed for cron and poll performance. |

---

## Immutability Rules

Once a `signer_jobs` row is persisted, the following fields **must never change**:

- `jobType`
- `requestId`
- `walletId`
- `networkId`
- `payloadVersion`
- `protocolVersion`
- `payload` (entire JSONB column — includes `signingPayload`, `payloadDigest`, `integritySignature`, `transactionVersion`)
- `expiresAt`
- `referenceId`
- `referenceType`
- `createdAt`

Only the following fields may change after creation:

- `status`
- `claimedBy`
- `claimedAt`
- `claimToken`
- `completedAt`
- `retryCount`
- `result`
- `errorMessage`
- `updatedAt` (automatic)
- `version` (automatic)

---

## Module Boundaries

### This module imports

- `TypeOrmModule.forFeature([SignerJob])` — entity registration.
- `NetworkModule` — read-only access to `NetworkService` for populating
  `SignerPayload.network` context inside `SigningPayloadBuilder`.
- `SharedModule` (global) — `ILogger`, `ICache`, `IEventPublisher`.
- `ScheduleModule` — for the stale-claim expiry cron task.

### This module exports

- `SignerJobService` — consumed by `WalletModule`, `SweepModule`, `WithdrawalModule`.
- `SigningPayloadBuilder` — consumed by the same upstream modules to assemble
  payloads before calling `createJob()`.

### Dependency direction

```
WalletModule ──────────────►┐
SweepModule ────────────────► SignerJobModule ──► NetworkModule
WithdrawalModule ───────────►┘                └──► SharedModule
```

`SignerJobModule` never imports `WalletModule`, `SweepModule`, or
`WithdrawalModule`. The dependency arrow is strictly one-way.

---

## Job Status State Machine

```
PENDING ──► CLAIMED ──► COMPLETED  (terminal)
PENDING ──► CANCELLED              (terminal)
CLAIMED ──► FAILED                 (terminal)
CLAIMED ──► EXPIRED                (terminal — cron-detected TTL breach)
```

Terminal states are immutable. No transition out of a terminal state
is permitted under any circumstances.

---

## Supported Job Types (Internal)

| Type | Origin | Signer sees it? |
|---|---|---|
| `CREATE_WALLET` | WalletModule | ❌ Never |
| `SWEEP` | SweepModule | ❌ Never |
| `WITHDRAW` | WithdrawalModule | ❌ Never |

All three are translated into a generic `SignerPayload` before the Signer
polls. The Signer receives only opaque bytes and cryptographic metadata.

---

## Architecture References

- Phase 3.5 Architecture Document, Revision 3 (Frozen)
- ADR-JM-001 through ADR-JM-013
