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
  │    ◄──────────── 200 (job) or 204 (empty)               │
  │                                                         │
  │    if 200:                                              │
  │      POST /signer/jobs/:requestId/claim  ────────────►  │
  │      ◄──────────── 200 (payload) or 409 (conflict)      │
  │                                                         │
  │    if 200 (claimed):                                    │
  │      sign signingPayload → return result (Step 5)       │
  └─────────────────────────────────────────────────────────┘
```

### Why Polling?

1. **Air-gap compatibility** — The Offline Signer may live in a network
   segment with no inbound connectivity. Polling requires only outbound
   TCP from the Signer to the Backend.

2. **No persistent connection required** — WebSockets and long-polling
   require connection state. Polling is stateless and resilient to
   Signer restarts.

3. **Simplified authentication surface** — Mutual TLS or WireGuard is
   easier to configure on outbound-only connections.

4. **No push infrastructure** — No WebSocket server, no SSE, no queue
   consumer on the Signer side. The Signer binary is a simple HTTP client.

5. **Back-pressure for free** — If the Signer is slow or offline,
   jobs accumulate in PENDING state without requiring queue management.
   The expiry cron handles stale jobs independently.

### Why the Backend Never Pushes

- The Backend has no stable address for the Signer.
- Pushing would require the Backend to know the Signer's network location,
  introducing a coupling the architecture explicitly forbids.
- Pushing to an offline Signer requires retry/queue logic. Polling
  eliminates this complexity entirely.

---

## Endpoints

### `GET /signer/jobs/available`

**Purpose**: Returns one available job for the Signer to inspect before
committing to a claim.

**Availability criteria** (all must be true):
- `status == PENDING`
- `expiresAt > now`
- `retryCount <= maxRetries`

**Ordering**: `createdAt ASC` — oldest first (FIFO).

**Returns**: One `AvailableJobResponse` or HTTP 204 No Content.

**What is NOT included**: `signingPayload`, `payloadDigest`,
`integritySignature` — these are only delivered after atomic claim.

---

### `POST /signer/jobs/:requestId/claim`

**Purpose**: Atomically acquires ownership of a PENDING job.

**Body**: `{ signerInstanceId: string }` — stable Signer identity.

**Returns**: `ClaimJobResponse` containing the full sealed `SignerPayload`
including `signingPayload`, `payloadDigest`, and `integritySignature`.

**On conflict**: HTTP 409 — another Signer already claimed the job.
The losing Signer discards the requestId and polls again.

---

## Atomic Claim

The claim operation is atomic at the database level:

1. `SignerJobService.claimJob()` fetches the job by UUID.
2. It verifies `status == PENDING` (throws `SignerJobAlreadyClaimedError`
   if `CLAIMED`).
3. It calls `SignerJobRepository.update()` which uses TypeORM optimistic
   locking (`@VersionColumn`). The SQL `WHERE version = $n` clause ensures
   only one concurrent writer succeeds.
4. The losing concurrent claim receives a database optimistic lock exception,
   which propagates as `SignerJobAlreadyClaimedError` → HTTP 409.

No application-level mutex, Redis lock, or queue is required.

---

## Authentication (Future)

Authentication is **not implemented** in Phase 3.5 Step 4.
Extension points are marked with `// AUTH-EXT:` comments in the controller.

### Planned Mechanisms

| Mechanism | Attachment Point | Notes |
|---|---|---|
| **Mutual TLS** | `@UseGuards(SignerMtlsGuard)` on controller | Reads `req.socket.getPeerCertificate()` |
| **WireGuard Identity** | `app.use(wireguardMiddleware)` in `main.ts` | Trusted header from local proxy |
| **API Key** | `@UseGuards(SignerApiKeyGuard)` + `@ApiBearerAuth()` | Already declared in Swagger |
| **Certificate Pinning** | Reverse proxy (nginx/Caddy) | No app-level change required |

When mTLS is activated, `signerInstanceId` in the request body will be
replaced or verified by the CN extracted from the verified peer certificate.

---

## Logging Policy

| Event | Level | What is logged |
|---|---|---|
| Queue polled, job found | `log` | `requestId`, `payloadVersion` |
| Queue polled, empty | `debug` | Poll event only |
| Job claimed | `log` | `requestId`, `signerInstanceId` |
| Claim rejected (conflict) | `warn` (service layer) | `requestId`, `signerInstanceId` |

**Never logged**:
- `signingPayload`
- `integritySignature`
- `payloadDigest`
- Any private key material

---

## Service Layer (Step 3)

For the complete lifecycle documentation, state machine, and domain error
table, see the **Service Layer** section of this README and
`services/signer-job.service.ts`.

### State Machine (summary)

```
PENDING → CLAIMED → COMPLETED
PENDING → CANCELLED
PENDING → EXPIRED
CLAIMED → FAILED
CLAIMED → CANCELLED
CLAIMED → EXPIRED
```

Terminal states: `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`.

---

## Architecture References

- Phase 3.5 Architecture Document, Revision 3 (Frozen)
- ADR-JM-001 through ADR-JM-013
- Phase 3.5 Step 2 (persistence layer)
- Phase 3.5 Step 3 (service layer)
- Phase 3.5 Step 4 (this file — HTTP interface)
