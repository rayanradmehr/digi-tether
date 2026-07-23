# WalletModule

The Wallet Module is the authoritative source for blockchain address
ownership within the Blockchain Backend.

---

## Purpose

This module owns:
- The wallet address inventory (wallet pool).
- Wallet assignment to customers.
- Wallet lifecycle status management.
- Pool health monitoring and replenishment signalling.
- Wallet creation triggers (via SignerJob).

---

## What This Module Does NOT Do

| Responsibility | Owner |
|---|---|
| Generate private keys | Offline Signer |
| Store private keys | Nobody (air-gapped) |
| Store balances | Blockchain Sync Module (Phase 5+) |
| Create transactions | Transaction Module |
| Sign transactions | Offline Signer |
| Build blockchain payloads | Offline Signer exclusively |
| Communicate with blockchain nodes | Blockchain Sync Module |
| Interpret customer identity | Exchange |
| Verify cryptographic signatures | Offline Signer |

---

## Responsibilities

1. **Wallet Pool** — maintain a pool of `AVAILABLE` pre-generated wallets per family.
2. **Assignment** — assign one wallet to a customer using the mandatory 2-phase reservation protocol.
3. **Lifecycle** — manage status transitions: `AVAILABLE → RESERVED → ASSIGNED`, plus `LOCKED`, `COMPROMISED`, `ARCHIVED`.
4. **Replenishment** — detect low pool levels and create `CREATE_WALLET` SignerJobs.
5. **Reservation Cleanup** — release expired reservations back to `AVAILABLE` every 10 seconds.
6. **Audit** — write an append-only audit log entry for every status transition.
7. **Events** — emit domain events for every significant state change.

---

## Boundaries

### Dependencies (imports from)

| Module | Usage |
|---|---|
| `NetworkModule` | Resolve `driverKey → WalletFamily` |
| `TokenModule` | Validate token support per family |
| `SignerJobModule` | Create `CREATE_WALLET` SignerJobs |

### Dependents (other modules import from this)

| Module | Usage |
|---|---|
| `SweepModule` | Resolve source wallet by customerId + driverFamily |
| `WithdrawalModule` | Resolve source wallet |
| `DepositModule` | Resolve receiving address |

### Forbidden imports

- `SweepModule`, `WithdrawalModule`, `DepositModule` — prevents circular dependency.
- Any blockchain library (`ethers`, `tronweb`, `bitcoinjs-lib`, etc.).
- Any RPC client.

---

## Wallet Families

| Family | Algorithm | Example Networks |
|---|---|---|
| `EVM` | ECDSA secp256k1 | Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche |
| `TRON` | ECDSA secp256k1 | Tron |
| `BITCOIN` | Schnorr secp256k1 | Bitcoin Taproot |
| `SOLANA` | Ed25519 | Solana |

All EVM chains share one wallet address. New EVM chains require only
a `driverKey` mapping addition in `WalletFamilyResolver`.

---

## Wallet Status Machine

```
AVAILABLE ──► RESERVED ──► ASSIGNED   (mandatory 2-phase; terminal for assignment)
RESERVED  ──► AVAILABLE                (reservation timeout or explicit release)
AVAILABLE ──► LOCKED ──► AVAILABLE    (temporary freeze)
ASSIGNED  ──► LOCKED ──► ASSIGNED     (investigation hold)
AVAILABLE ──► COMPROMISED             (terminal)
AVAILABLE ──► ARCHIVED                (terminal)
ASSIGNED  ──► COMPROMISED             (terminal)
LOCKED    ──► COMPROMISED             (terminal)
LOCKED    ──► ARCHIVED                (terminal)
```

`COMPROMISED` and `ARCHIVED` are permanently terminal.
A wallet may only be assigned **once** — `customer_id` never changes.
**Direct `AVAILABLE → ASSIGNED` is permanently forbidden.** Reservation is mandatory.

---

## Wallet Pool

### Invariant
For every active `WalletFamily`, the number of `AVAILABLE` wallets must
remain ≥ `minPoolSize` (default: 500). `RESERVED` wallets are excluded from
the available count.

### Replenishment Trigger
When available wallets fall below `replenishThreshold` (default: 100):
1. `WalletPoolService` creates `batchSize` (default: 50) `CREATE_WALLET` SignerJobs.
2. Each job payload is `CreateWalletJobPayload { driverFamily, quantity: 1, reason: 'pool_replenishment' }`.
3. The Offline Signer processes jobs asynchronously.
4. Each completed job produces one new `AVAILABLE` wallet.
5. `WalletPoolReplenished` event is emitted when pool recovers.

### Reservation TTL
Any wallet held in `RESERVED` status longer than `reservation_ttl_seconds`
(default: 30 seconds) is automatically released back to `AVAILABLE` by the
reservation cleanup cron (runs every 10 seconds).

### Monitoring
`WalletPoolLow` event triggers a production alert when pool < threshold.
Pool status is visible via `GET /v1/wallets/pool/status`.

---

## Wallet Creation Flow

```
[Cron: 60s interval]
  → WalletPoolService.checkAllFamilies()
  → available < replenishThreshold
  → Creates CREATE_WALLET SignerJob(s)
     payload: CreateWalletJobPayload { driverFamily, quantity: 1, reason }
  → Offline Signer polls, claims, generates key pair
  → Signer posts result to /signer/jobs/:requestId/result
     result includes: address, publicKey, publicKeyFingerprint, signerVersion
  → WalletCreationResultHandler processes result
  → Validates: publicKey is present (mandatory)
  → WalletService.createFromSignerResult()
  → Wallet stored: status = AVAILABLE
  → WalletCreated event emitted
  → WalletPoolReplenished event emitted

[Cron: 10s interval]
  → WalletReservationCleanupTask runs
  → WalletRepository.releaseExpiredReservations()
  → Any RESERVED wallet older than reservation_ttl_seconds → AVAILABLE
```

The backend **never** generates keys. The Signer **never** sends private keys.

---

## Wallet Assignment Flow

Assignment is a mandatory 2-phase operation. Both phases run inside a
single database transaction.

```
Exchange API call: POST /v1/wallets/assign
  → WalletController.assign()
  → WalletService.assignWallet({ customerId, driverFamily })
  → Check: customer already has wallet for this family?
       YES → return existing wallet (idempotent)
  → BEGIN TRANSACTION
      PHASE 1 — Reserve:
        WalletRepository.reserveWallet(driverFamily)
          SELECT ... WHERE status='AVAILABLE' ORDER BY created_at ASC LIMIT 1
          FOR UPDATE SKIP LOCKED
          UPDATE SET status='RESERVED', reservation_token=uuid(), reserved_at=NOW()
          → null → ROLLBACK → throw WalletPoolExhaustedError
      PHASE 2 — Assign:
        WalletRepository.assignWallet({ walletId, reservationToken, customerId })
          UPDATE SET status='ASSIGNED', customer_id=..., assigned_at=NOW(),
            reservation_token=NULL, reserved_at=NULL
          WHERE id=$1 AND reservation_token=$2 AND status='RESERVED'
  → COMMIT
  → WalletAuditLogRepository.append(entry)
  → WalletAssigned event emitted
  → Return: { walletId, address, driverFamily }
```

Assignment latency: < 50ms. No Signer involvement.

---

## Security

### Exchange → Backend
- HTTPS (TLS 1.3)
- API Key authentication
- HMAC-SHA256 request signature

### Offline Signer → Backend
- WireGuard VPN tunnel
- mTLS (per-Signer certificate)
- Bearer API Key
- HMAC-SHA256 integritySignature on every payload

### Private Key Isolation
Private keys exist **only** inside the Offline Signer.
The backend stores per wallet:
- `address` — derivable from public key; not sensitive.
- `publicKey` — full public key hex; not sensitive (derivable from any on-chain tx).
- `publicKeyFingerprint` — compact SHA-256 audit reference; not sensitive.
- `signerVersion` — audit metadata only.

No private key data ever touches the backend network.

---

## Error Types

| Error | Trigger |
|---|---|
| `WalletNotFoundError` | Wallet not found by ID or address |
| `WalletAlreadyAssignedError` | Attempt to assign an already-assigned wallet |
| `WalletPoolExhaustedError` | No AVAILABLE wallets in pool for the requested family |
| `WalletInvalidStatusError` | Lifecycle transition not permitted from current status |
| `WalletTerminalStatusError` | Attempt to transition a COMPROMISED or ARCHIVED wallet |
| `WalletReservationTokenMismatchError` | Token presented does not match reservation |
| `WalletFamilyNotSupportedError` | Unrecognised driver family |
| `WalletDuplicateCustomerError` | Customer already has a wallet for this family |

---

## Domain Events

| Event | Trigger |
|---|---|
| `WalletCreated` | New wallet stored from Signer result |
| `WalletAssigned` | Wallet assigned to customer |
| `WalletLocked` | Wallet frozen |
| `WalletUnlocked` | Wallet unfrozen |
| `WalletCompromised` | Wallet permanently decommissioned |
| `WalletArchived` | Wallet retired |
| `WalletPoolLow` | Available count fell below threshold |
| `WalletPoolReplenishmentRequested` | Replenishment jobs created |
| `WalletPoolReplenished` | Pool count recovered above threshold |

---

## API Endpoints

### Exchange-Facing (`/v1/wallets`)

| Method | Path | Action |
|---|---|---|
| `POST` | `/assign` | Assign a wallet to a customer |
| `GET` | `/customer/:customerId` | List all wallets for customer |
| `GET` | `/customer/:customerId/family/:family` | Get family wallet for customer |
| `GET` | `/:walletId` | Get wallet by ID |
| `GET` | `/address/:address` | Resolve address to wallet |

### Admin (`/v1/wallets`)

| Method | Path | Action |
|---|---|---|
| `POST` | `/:walletId/lock` | Lock wallet |
| `POST` | `/:walletId/unlock` | Unlock wallet |
| `POST` | `/:walletId/compromise` | Mark compromised |
| `POST` | `/:walletId/archive` | Archive wallet |
| `GET` | `/pool/status` | Pool counts per family |
| `GET` | `/pool/config` | Pool thresholds per family |
| `PUT` | `/pool/config/:family` | Update pool config |
| `GET` | `/` | Paginated wallet list |
| `GET` | `/:walletId/audit` | Audit log for wallet |

---

## Future Roadmap

| Feature | Phase | Notes |
|---|---|---|
| HD Wallets | Phase 6 | Derivation path in payload; Signer handles BIP-32 |
| Multi-Sig | Phase 7 | New `WalletType`; quorum owned by Signer |
| MPC Wallets | Phase 7 | Distributed key shares; multiple Signers |
| Cold/Hot Separation | Phase 6 | `WalletTier` enum; separate pool configs |
| Rust Signer | Any phase | Zero backend change; protocol is Signer-agnostic |
| Solana Support | Phase 5 | Add `SOLANA` family; resolver update only |
| NEAR Support | Phase 5+ | Same as Solana path |
| Watch-only Wallets | Phase 5 | `WalletType.WATCH_ONLY`; no SignerJob required |

---

## Why the Backend Never Creates Wallets

1. **Private Key Isolation** — Key generation requires a secure, air-gapped environment.
   The backend is network-accessible and must never touch private key material.

2. **Architecture Rule §3** — Explicitly prohibits backend cryptographic key generation.

3. **Attack Surface** — If the backend were compromised, no private keys could be
   extracted because none exist there.

4. **HSM Agnosticism** — The Signer can use any hardware: software keys, HSMs,
   MPC networks. The backend is indifferent to the Signer's internals.

5. **Rust Signer Compatibility** — The Signer protocol is language and runtime
   agnostic. A future Rust Signer requires zero backend changes.

---

## Architecture References

- Phase 4 Architecture Document (`ARCHITECTURE.md`)
- Phase 4 Domain Model (`DOMAIN-MODEL.md`)
- Phase 3.5 SignerJob Module (`src/modules/signer-job/README.md`)
- ADR-WM-001 through ADR-WM-010 (`src/modules/wallet/ADR.md`)
- Architecture Rules §3 (Private Key Isolation), §12 (No Crypto in Backend)
