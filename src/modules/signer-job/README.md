# SignerJobModule

This module owns the complete lifecycle of `signer_jobs` rows and exposes
the Pull API used by the Offline Signer.

---

## Pull Architecture

The communication between the Backend and the Offline Signer is **strictly
pull-based**. The Backend never initiates contact with the Signer.

```
  ┌─────────────────────────────────────────────────────────┐
  │                    Offline Signer                       │
  │                                                         │
  │  loop:                                                  │
  │    GET /signer/jobs/available  ──────────────────────►  │
  │    ◄────────────── 200 (job) or 204 (empty)             │
  │                                                         │
  │    if 200:                                              │
  │      POST /signer/jobs/:requestId/claim  ────────────►  │
  │      ◄──────────── 200 (payload) or 409 (conflict)      │
  │                                                         │
  │    if 200 (claimed):                                    │
  │      sign signingPayload offline                        │
  │      POST /signer/jobs/:requestId/result  ───────────►  │
  │      ◄──────────── 200 (accepted) or 4xx (rejected)     │
  └─────────────────────────────────────────────────────────┘
```

### Why Polling?

1. **Air-gap compatibility** — The Offline Signer may live in a network
   segment with no inbound connectivity. Polling requires only outbound TCP.
2. **No persistent connection** — Polling is stateless and resilient to Signer restarts.
3. **Simplified auth surface** — mTLS is easier to configure on outbound-only connections.
4. **No push infrastructure** — No WebSocket server, no SSE, no queue consumer.
5. **Back-pressure for free** — Jobs accumulate in PENDING; the expiry cron handles stale jobs.

### Why the Backend Never Pushes

The Backend has no stable address for the Signer. Pushing would introduce
a coupling the architecture explicitly forbids.

---

## Endpoints

### `GET /signer/jobs/available`

**Purpose**: Returns one available job for inspection before claiming.

**Availability criteria** (all must be true):
- `status == PENDING`
- `expiresAt > now`
- `retryCount <= maxRetries`

**Ordering**: `createdAt ASC` (FIFO).
**Returns**: One `AvailableJobResponse` or HTTP 204.
**Excluded**: `signingPayload`, `payloadDigest`, `integritySignature`.

---

### `POST /signer/jobs/:requestId/claim`

**Purpose**: Atomically acquires ownership of a PENDING job.
**Body**: `{ signerInstanceId: string }`
**Returns**: `ClaimJobResponse` with the full sealed `SignerPayload`.
**On conflict**: HTTP 409 — another Signer instance won.

---

### `POST /signer/jobs/:requestId/result`

**Purpose**: Accepts a completed signing result and transitions the job
from `CLAIMED` to `COMPLETED`.

**Body** (`SubmitResultRequest`):
- `requestId` — echoed from the payload (must match path param).
- `signature` — hex-encoded cryptographic output (SENSITIVE — never logged).
- `signatureAlgorithm` — must match `payload.signAlgorithm`.
- `publicKeyFingerprint` — short audit fingerprint.
- `completedAt` — ISO 8601 signing timestamp.
- `result` — full `SignerResult` nested object.

**Returns**: `SubmitResultResponse` containing `requestId`, `status`,
`completedAt`, and `processingDuration`.

**Response excludes**: signature, signingPayload, payloadDigest,
integritySignature, claimToken, walletId, publicKey.

---

## Completion Flow

```
Signer                          Backend
  │                               │
  │  POST /result { body }        │
  │ ──────────────────────────►   │
  │                               │  1. findByRequestId → job
  │                               │  2. assertResultIntegrity(body, job)
  │                               │     a. body.requestId == path requestId
  │                               │     b. result.requestId == path requestId
  │                               │     c. integritySignature present in payload
  │                               │     d. payloadDigest present in payload
  │                               │     e. signatureAlgorithm == payload.signAlgorithm
  │                               │     f. result.signAlgorithm == payload.signAlgorithm
  │                               │     g. result.signatureFormat == payload.signatureFormat
  │                               │     h. payloadVersion >= 1
  │                               │     i. protocolVersion >= 1
  │                               │     j. transactionVersion >= 1
  │                               │     k. completedAt ∈ [payload.createdAt, payload.expiresAt]
  │                               │  3. completeJob(jobId, storedClaimToken, result)
  │                               │  4. job.status = COMPLETED
  │  ◄──────────────────────────  │
  │  200 { requestId, status,     │
  │        completedAt,           │
  │        processingDuration }   │
```

---

## Result Validation

The backend performs **metadata equality checks only**. No cryptographic
operation is performed at any step.

| Check | Rejection Code | Reason |
|---|---|---|
| body.requestId ≠ path requestId | 422 | Replay / routing error |
| result.requestId ≠ path requestId | 422 | Replay / routing error |
| integritySignature absent | 422 | Corrupt stored payload |
| payloadDigest absent | 422 | Corrupt stored payload |
| signatureAlgorithm ≠ stored | 422 | Algorithm mismatch |
| result.signAlgorithm ≠ stored | 422 | Algorithm mismatch |
| result.signatureFormat ≠ stored | 422 | Format mismatch |
| payloadVersion < 1 | 422 | Corrupt stored data |
| protocolVersion < 1 | 422 | Corrupt stored data |
| transactionVersion < 1 | 422 | Corrupt stored data |
| completedAt outside window | 422 | Timing violation |
| status ≠ CLAIMED | 409/422 | Invalid state |
| Duplicate submission | 409 | Already COMPLETED |

---

## Why the Backend Never Verifies Blockchain Signatures

1. **Air-gap trust model** — The Offline Signer is the sole authority
   over cryptographic correctness. Signature verification would require
   the backend to possess the public key and implement curve-specific
   verification — coupling it to cryptographic libraries.

2. **No private key exposure** — The backend intentionally has no access
   to private keys. Verifying the signature would require the public key,
   which is derivable from the private key.

3. **Blockchain-agnostic backend** — The backend must not import
   `ethers`, `tronweb`, or any crypto library. Signature schemes differ
   by algorithm (ECDSA/Ed25519/Schnorr) and format (RAW/DER/RSV/RECOVERABLE).

4. **Broadcast validates implicitly** — When the signed transaction is
   broadcast to the blockchain (Phase 4), the RPC node performs full
   cryptographic verification. An invalid signature causes broadcast
   rejection, which is the correct failure mode.

5. **Architecture Rule §12** — Explicitly prohibits backend cryptographic
   operations. See the frozen ADR set.

---

## State Machine

```
PENDING → CLAIMED → COMPLETED  ✓ (normal path)
PENDING → CANCELLED             ✓
PENDING → EXPIRED               ✓ (cron)
CLAIMED → FAILED                ✓ (error result or validation failure)
CLAIMED → CANCELLED             ✓
CLAIMED → EXPIRED               ✓ (cron)
```

Terminal states: `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`.
A job in a terminal state is immutable — no further mutations permitted.

---

## Immutability Guarantees

The following fields **never change** after job creation:

| Field | Column | Notes |
|---|---|---|
| `requestId` | `request_id` | Unique index; immutable by design |
| `payload` | `payload` (JSONB) | Entire sealed payload column |
| `payloadDigest` | inside `payload` | Part of sealed payload |
| `integritySignature` | inside `payload` | Part of sealed payload |
| `signingPayload` | inside `payload` | Opaque blob; never modified |
| `walletId` | `wallet_id` | Denormalised; immutable |
| `networkId` | `network_id` | Denormalised; immutable |
| `expiresAt` | `expires_at` | Denormalised; immutable |
| `payloadVersion` | `payload_version` | Denormalised; immutable |
| `protocolVersion` | `protocol_version` | Denormalised; immutable |
| `referenceId` | `reference_id` | Immutable |
| `referenceType` | `reference_type` | Immutable |
| `jobType` | `job_type` | Immutable |

---

## Future Broadcast Flow (Phase 4)

After a job reaches `COMPLETED`, the signed result is available in the
`result` JSONB column. Phase 4 will:

1. Listen for job completion events (EventEmitter — Phase 4 Step 1).
2. Route the `SignerResult` to the appropriate driver
   (`BlockchainDriver.broadcast(result)`).
3. Update the originating entity (Wallet / Sweep / Withdrawal) with
   the transaction hash.
4. Emit a `TransactionBroadcast` domain event.

The `SignerJobModule` plays no role in broadcast — it only stores the
result. Separation of concerns is enforced by architecture.

---

## Logging Policy

| Event | Level | Logged fields |
|---|---|---|
| Queue polled, job found | `log` | `requestId`, `payloadVersion` |
| Queue polled, empty | `debug` | Poll event only |
| Job claimed | `log` | `requestId`, `signerInstanceId` |
| Result accepted | `log` | `requestId`, `signerVersion` |
| Result rejected | `warn` | `requestId`, `reason` (no crypto material) |
| Claim rejected | `warn` (service) | `requestId`, `signerInstanceId` |

**Never logged**: `signature`, `signingPayload`, `payloadDigest`,
`integritySignature`, `publicKey`, wallet data.

---

## Authentication (Future)

| Mechanism | Attachment Point | Notes |
|---|---|---|
| Mutual TLS | `@UseGuards(SignerMtlsGuard)` | Reads peer certificate CN |
| WireGuard | `app.use(wireguardMiddleware)` | Trusted header from proxy |
| API Key | `@UseGuards(SignerApiKeyGuard)` | Bearer token validation |
| Cert Pinning | Reverse proxy | No app change required |

---

## Architecture References

- Phase 3.5 Architecture Document, Revision 3 (Frozen)
- ADR-JM-001 through ADR-JM-013
- Phase 3.5 Step 2 — Persistence layer
- Phase 3.5 Step 3 — Service layer (lifecycle)
- Phase 3.5 Step 4 — Pull API (available + claim)
- Phase 3.5 Step 5 — Result submission (this step)
