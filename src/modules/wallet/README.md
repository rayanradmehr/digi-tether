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
| Communicate with blockchain nodes | Blockchain Sync Module |
| Interpret customer identity | Exchange |
| Verify cryptographic signatures | Offline Signer |

---

## Responsibilities

1. **Wallet Pool** — maintain a pool of `AVAILABLE` pre-generated wallets per family.
2. **Assignment** — atomically assign one `AVAILABLE` wallet to a customer.
3. **Lifecycle** — manage status transitions: AVAILABLE → ASSIGNED → LOCKED → ARCHIVED.
4. **Replenishment** — detect low pool levels and create `CREATE_WALLET` SignerJobs.
5. **Audit** — write an append-only audit log entry for every status transition.
6. **Events** — emit domain events for every significant state change.

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
| `SweepModule` | Resolve source wallet by customerId + family |
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
AVAILABLE ──► ASSIGNED  (terminal for assignment; one customer forever)
AVAILABLE ──► LOCKED ──► AVAILABLE  (temporary freeze)
AVAILABLE ──► COMPROMISED  (terminal)
AVAILABLE ──► ARCHIVED    (terminal)
ASSIGNED  ──► LOCKED ──► ASSIGNED   (investigation hold)
ASSIGNED  ──► COMPROMISED  (terminal)
LOCKED    ──► COMPROMISED  (terminal)
LOCKED    ──► ARCHIVED     (terminal)
```

`COMPROMISED` and `ARCHIVED` are permanently terminal.
A wallet may only be assigned **once** — `customer_id` never changes.

---

## Wallet Pool

### Invariant
For every active `WalletFamily`, the number of `AVAILABLE` wallets must
remain ≥ `minPoolSize` (default: 500).

### Replenishment Trigger
When available wallets fall below `replenishThreshold` (default: 100):
1. `WalletPoolService` creates `batchSize` (default: 50) `CREATE_WALLET` SignerJobs.
2. The Offline Signer processes jobs asynchronously.
3. Each completed job produces one new `AVAILABLE` wallet.
4. `WalletPoolReplenished` event is emitted when pool recovers.

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
  → Offline Signer polls, claims, generates key pair
  → Signer posts result to /signer/jobs/:requestId/result
  → WalletCreationResultHandler processes result
  → WalletService.createFromSignerResult()
  → Wallet stored: status = AVAILABLE
  → WalletCreated event emitted
  → WalletPoolReplenished event emitted
```

The backend **never** generates keys. The Signer **never** sends private keys.

---

## Wallet Assignment Flow

```
Exchange API call: POST /v1/wallets/assign
  → WalletController.assign()
  → WalletService.assignWallet({ customerId, family })
  → WalletRepository.findFirstAvailable(family) [FOR UPDATE SKIP LOCKED]
  → WalletRepository.update(wallet, { status: ASSIGNED, customerId })
  → WalletAuditLogRepository.append(entry)
  → WalletAssigned event emitted
  → Return: { walletId, address, family }
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
The backend stores only: `address`, `publicKeyFingerprint`, `signerVersion`.
No private key data ever touches the backend network.

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

- Phase 4 Architecture Document (this file + `ARCHITECTURE.md`)
- Phase 3.5 SignerJob Module (`src/modules/signer-job/README.md`)
- ADR-WM-001 through ADR-WM-009 (`src/modules/wallet/ADR.md`)
- Architecture Rules §3 (Private Key Isolation), §12 (No Crypto in Backend)
