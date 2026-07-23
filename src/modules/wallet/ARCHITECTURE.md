# Wallet Module — Phase 4 Architecture

Revision 2 — Updated per approved decisions (Phase 4 Step 6 pre-implementation review)

This document defines the complete architecture of the Wallet Module.
No code may be written without referencing this document.
No deviation from this architecture is permitted without a ratified ADR.

---

## 1. Purpose

The Wallet Module is the single source of truth for:

- Blockchain address ownership records.
- Wallet assignment to customers.
- Wallet pool health and replenishment signalling.
- Wallet lifecycle status management.

It does **not** generate wallets. It does **not** communicate with blockchains.
It does **not** hold balances. It does **not** create transactions or signatures.

---

## 2. Boundaries

### 2.1 What the Wallet Module OWNS

| Concern | Column / Table |
|---|---|
| Wallet address | `wallets.address` |
| Wallet driver family | `wallets.driver_family` |
| Wallet status | `wallets.status` |
| Customer assignment | `wallets.customer_id`, `wallets.assigned_at` |
| Pool inventory counts | derived from `wallets` table via repository |
| Wallet creation signalling | creates `CREATE_WALLET` SignerJobs |
| Wallet pool threshold config | `wallet_pool_config` table |
| Wallet audit log | `wallet_audit_log` table |

### 2.2 What the Wallet Module NEVER OWNS

| Concern | Owner |
|---|---|
| Wallet balances | Blockchain Sync Module (Phase 5+) |
| Transaction history | Transaction Module |
| Private keys | Offline Signer — never touches the backend |
| HD derivation paths | Offline Signer |
| National ID / KYC identity | Exchange — passed as opaque `customerId` |
| Network configuration | Network Module |
| Token metadata | Token Module |
| Signing payloads | SignerJob Module |
| Signature verification | Offline Signer |
| Blockchain payload building | Offline Signer exclusively |

### 2.3 Dependency Graph (no cycles)

```
Wallet Module
  └── depends on:
        ├── NetworkModule   (read network config, family resolution)
        ├── TokenModule     (read supported tokens per family)
        └── SignerJobModule (create CREATE_WALLET jobs)

Wallet Module
  └── is depended on by:
        ├── Sweep Module    (resolves source wallet)
        ├── Withdrawal Module (resolves source wallet)
        └── Deposit Module  (resolves receiving address)
```

The Wallet Module NEVER imports from Sweep, Withdrawal, or Deposit modules.
Circular imports are forbidden by architecture.

---

## 3. Wallet Families

A **Wallet Family** maps to a single cryptographic key-pair type.
All networks within the same family share the same underlying address.

| Family | Algorithm | Networks |
|---|---|---|
| `EVM` | `ECDSA_SECP256K1` | Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche C-Chain, and all future EVM chains |
| `TRON` | `ECDSA_SECP256K1` | Tron mainnet, Tron Nile testnet |
| `BITCOIN` | `SCHNORR` | Bitcoin mainnet, Bitcoin testnet |
| `SOLANA` | `ED25519` | Solana mainnet, Solana devnet |
| `NEAR` | `ED25519` | NEAR mainnet, NEAR testnet (future) |

### 3.1 Why EVM Chains Share One Wallet

All EVM-compatible chains derive wallet addresses identically from the
secp256k1 public key. A single address is valid on every EVM chain
simultaneously. Creating separate wallets per EVM chain would waste pool
capacity, create fragmented inventory, and provide no security benefit.

A single `EVM` wallet record serves all EVM networks.
The network context is resolved at sweep/withdrawal time by the calling module.

### 3.2 Family Resolution

The Network Module provides the `driverKey` for each network.
The Wallet Module maps `driverKey → WalletFamily` through a static
`WalletFamilyResolver` (future service). This resolver is the single
source of truth for the mapping and must be extended when new chains are added.

---

## 4. Wallet Status Machine

```
AVAILABLE
    │
    ├──[reserve()]──────────────► RESERVED      (intermediate — mandatory)
    │                                │
    │                    [assign(token)]│[release()/timeout]
    │                                │           │
    │                                ▼           ▼
    │                           ASSIGNED      AVAILABLE
    │                           (terminal     (returned
    │                           for owner)     to pool)
    │
    ├──[lock()]─────────────────► LOCKED
    │                                │
    │                                ├──[unlock()]───► AVAILABLE (restored)
    │                                ├──[compromise()]► COMPROMISED (terminal)
    │                                └──[archive()]──► ARCHIVED   (terminal)
    │
    ├──[compromise()]────────────► COMPROMISED  (terminal)
    │
    └──[archive()]───────────────► ARCHIVED     (terminal)

ASSIGNED
    │
    ├──[lock()]─────────────────► LOCKED        (rare: investigation hold)
    │
    └──[compromise()]────────────► COMPROMISED  (terminal)

LOCKED
    │
    ├──[unlock()]────────────────► previous status (AVAILABLE or ASSIGNED)
    │
    ├──[compromise()]────────────► COMPROMISED  (terminal)
    │
    └──[archive()]───────────────► ARCHIVED     (terminal)

COMPROMISED  ─── terminal ─── no further transitions permitted
ARCHIVED     ─── terminal ─── no further transitions permitted
```

**Assignment is mandatory 2-phase.**
Direct `AVAILABLE → ASSIGNED` skipping `RESERVED` is permanently forbidden.
`WalletService.assignWallet()` internally executes `reserve → assign`
inside a single database transaction. See §7.

### 4.1 Status Definitions

| Status | Meaning |
|---|---|
| `AVAILABLE` | Wallet is in the pool, not yet assigned to any customer |
| `RESERVED` | Temporarily claimed for an in-progress assignment; released if not completed within TTL |
| `ASSIGNED` | Wallet is permanently assigned to a customer — immutable ownership |
| `LOCKED` | Wallet is temporarily frozen; cannot be used for new operations |
| `COMPROMISED` | Wallet is permanently decommissioned; private key may be exposed |
| `ARCHIVED` | Wallet is retired; historical record only |

### 4.2 Transition Rules

- A wallet may only be assigned once. `ASSIGNED` status is irreversible.
- Assignment MUST go through `RESERVED` — direct `AVAILABLE → ASSIGNED` is rejected.
- `COMPROMISED` and `ARCHIVED` are terminal — no status change is ever permitted.
- `LOCKED` preserves the previous status; `unlock()` restores it.
- Only the `WalletService` may trigger status transitions.
- Repository methods must never apply business rules — they persist only.

---

## 5. Wallet Pool Architecture

### 5.1 Pool Invariant

At all times, for each `WalletFamily`, the number of `AVAILABLE` wallets
must be ≥ the configured `minPoolSize` (default: 500 per family).

If available wallets fall below `replenishThreshold` (default: 100 per family),
the `WalletPoolService` must trigger replenishment.

`RESERVED` wallets are excluded from the available count.

### 5.2 Pool Configuration (per family)

| Parameter | Default | Description |
|---|---|---|
| `minPoolSize` | 500 | Target pool size after replenishment |
| `replenishThreshold` | 100 | Trigger replenishment when available < this |
| `batchSize` | 50 | Number of CREATE_WALLET jobs to issue per replenishment cycle |
| `maxConcurrentJobs` | 10 | Maximum simultaneously active CREATE_WALLET SignerJobs |
| `reservationTtlSeconds` | 30 | Seconds before an expired reservation is released back to AVAILABLE |

These parameters are stored in a `wallet_pool_config` table (per family row)
and must be configurable at runtime without code deployment.

### 5.3 Pool Replenishment Flow

```
[Scheduled Cron: every 60s]
        │
        ▼
WalletPoolService.checkThreshold(driverFamily)
        │
        ├─ available >= replenishThreshold ──► no action
        │
        └─ available < replenishThreshold
                │
                ▼
        WalletPoolService.replenish(driverFamily)
                │
                ▼
        Compute: needed = min(batchSize, minPoolSize - available)
                │
                ▼
        For each i in [1..needed]:
          SignerJobService.createJob({
            jobType: CREATE_WALLET,
            payload: CreateWalletJobPayload {
              driverFamily,
              quantity: 1,
              reason: 'pool_replenishment'
            }
          })
                │
                ▼
        Emit: WalletPoolReplenishmentRequested { driverFamily, jobsCreated: needed }
                │
                ▼
[Offline Signer polls and processes CREATE_WALLET jobs]
        │
        ▼
[Signer posts result to POST /signer/jobs/:requestId/result]
        │
        ▼
WalletCreationResultHandler.handle(result)
        │
        ▼
WalletService.createFromSignerResult(result)
        │
        ▼
WalletRepository.save({ address, driverFamily, status: AVAILABLE, ... })
        │
        ▼
Emit: WalletCreated { walletId, address, driverFamily }
        │
        ▼
Emit: WalletPoolReplenished { driverFamily, newAvailableCount }
```

### 5.4 Why Wallets Are Pre-Generated

See ADR-WM-002.

---

## 6. Wallet Creation Flow (Full)

```
 Exchange / Internal Trigger
         │
         ▼
  WalletPoolService detects low pool
         │
         ▼
  Creates CREATE_WALLET SignerJob
  (payload: CreateWalletJobPayload { driverFamily, quantity, reason })
         │
         ▼
  SignerJob persisted — status: PENDING
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │           OFFLINE SIGNER (air-gapped)         │
  │                                               │
  │  Polls GET /signer/jobs/available             │
  │  Claims job via POST /signer/jobs/:id/claim   │
  │  Generates key pair offline                   │
  │  Computes address from public key             │
  │  Signs response payload (integritySignature)  │
  │  Posts result POST /signer/jobs/:id/result    │
  └──────────────────────────────────────────────┘
         │
         ▼
  Backend receives result
  Verifies: requestId, payloadDigest, integritySignature presence
  (NO cryptographic verification — as per Architecture Rule §12)
         │
         ▼
  WalletCreationResultHandler processes result
  Validates: publicKey is present and non-empty (required field)
         │
         ▼
  Wallet persisted: {
    address, driverFamily, status: AVAILABLE,
    publicKey, publicKeyFingerprint, signerVersion,
    createdByJobId
  }
         │
         ▼
  WalletCreated event emitted
         │
         ▼
  Pool count recalculated
         │
         ▼
  WalletPoolReplenished event emitted (if threshold crossed)
```

---

## 7. Wallet Assignment Flow

Assignment is a mandatory 2-phase operation.
`WalletService.assignWallet()` wraps both phases inside **one database transaction**.

```
  Customer onboarding trigger
  (from Exchange API via Blockchain Backend API)
         │
         ▼
  WalletService.assignWallet({ customerId, driverFamily })
         │
         ├─ Validate customerId is not empty
         ├─ Validate driverFamily is supported
         ├─ Check: customer already has wallet for this family?
         │         └─ YES → return existing wallet (idempotent)
         │
         ▼
  ┌─────── BEGIN DATABASE TRANSACTION ────────────────────────────────┐
  │                                                                    │
  │  PHASE 1 — Reserve                                                 │
  │  WalletRepository.reserveWallet(driverFamily)                      │
  │    ─ SELECT ... WHERE driver_family = $1                           │
  │        AND status = 'AVAILABLE'                                    │
  │        ORDER BY created_at ASC LIMIT 1                             │
  │        FOR UPDATE SKIP LOCKED                                      │
  │    ─ UPDATE SET status='RESERVED',                                 │
  │        reservation_token=uuid(),                                   │
  │        reserved_at=NOW(),                                          │
  │        version=version+1                                           │
  │    ─ Returns: { walletId, reservationToken } or null               │
  │         │                                                          │
  │         ├─ null → ROLLBACK → throw WalletPoolExhaustedError        │
  │         │         + emit WalletPoolLow event                       │
  │         │                                                          │
  │  PHASE 2 — Assign                                                  │
  │  WalletRepository.assignWallet({                                   │
  │    walletId, reservationToken, customerId                          │
  │  })                                                                │
  │    ─ UPDATE SET status='ASSIGNED',                                 │
  │        customer_id=$customerId,                                    │
  │        assigned_at=NOW(),                                          │
  │        reservation_token=NULL,                                     │
  │        reserved_at=NULL,                                           │
  │        version=version+1                                           │
  │    WHERE id=$walletId                                              │
  │      AND reservation_token=$reservationToken                       │
  │      AND status='RESERVED'                                         │
  │                                                                    │
  └─────── COMMIT ─────────────────────────────────────────────────────┘
         │
         ▼
  WalletAuditLogRepository.append(entry)
         │
         ▼
  Emit: WalletAssigned { walletId, customerId, driverFamily, address }
         │
         ▼
  Return: WalletAssignmentResult { walletId, address, driverFamily }
```

---

## 8. Folder Structure

```
src/modules/wallet/
│
├── ARCHITECTURE.md          ← this file
├── README.md
│
├── wallet.module.ts
│
├── contracts/
│   ├── create-wallet-job-payload.contract.ts
│   ├── wallet-creation-result.contract.ts
│   └── wallet-assignment-result.contract.ts
│
├── controllers/
│   ├── wallet.controller.ts          ← Exchange-facing API
│   └── wallet-admin.controller.ts    ← Internal admin API
│
├── dto/
│   ├── assign-wallet.request.ts
│   ├── assign-wallet.response.ts
│   ├── get-wallet.response.ts
│   ├── list-wallets.request.ts
│   ├── list-wallets.response.ts
│   ├── lock-wallet.request.ts
│   ├── lock-wallet.response.ts
│   ├── archive-wallet.request.ts
│   └── wallet-pool-status.response.ts
│
├── entities/
│   ├── wallet.entity.ts
│   ├── wallet-pool-config.entity.ts
│   └── wallet-audit-log.entity.ts
│
├── enums/
│   ├── wallet-status.enum.ts
│   ├── wallet-family.enum.ts
│   └── wallet-audit-action.enum.ts
│
├── errors/
│   ├── wallet-not-found.error.ts
│   ├── wallet-already-assigned.error.ts
│   ├── wallet-pool-exhausted.error.ts
│   ├── wallet-invalid-status.error.ts
│   ├── wallet-family-not-supported.error.ts
│   ├── wallet-duplicate-customer.error.ts
│   ├── wallet-terminal-status.error.ts
│   └── wallet-reservation-token-mismatch.error.ts
│
├── events/
│   ├── wallet-created.event.ts
│   ├── wallet-assigned.event.ts
│   ├── wallet-locked.event.ts
│   ├── wallet-unlocked.event.ts
│   ├── wallet-compromised.event.ts
│   ├── wallet-archived.event.ts
│   ├── wallet-pool-low.event.ts
│   ├── wallet-pool-replenished.event.ts
│   └── wallet-pool-replenishment-requested.event.ts
│
├── handlers/
│   └── wallet-creation-result.handler.ts
│       ← Listens to SignerJob COMPLETED events for CREATE_WALLET jobs
│       ← Calls WalletService.createFromSignerResult()
│
├── repositories/
│   ├── wallet.repository.ts
│   ├── wallet.repository.interface.ts
│   ├── wallet-pool-config.repository.ts
│   └── wallet-audit-log.repository.ts
│
├── resolvers/
│   └── wallet-family.resolver.ts
│       ← Maps driverKey → WalletFamily
│       ← Single source of truth for family mapping
│
├── services/
│   ├── wallet.service.ts
│   ├── wallet.service.interface.ts
│   ├── wallet-pool.service.ts
│   └── wallet-pool.service.interface.ts
│
├── tasks/
│   ├── wallet-pool-check.task.ts
│   │   ← @Cron every 60s
│   │   ← Calls WalletPoolService.checkAllFamilies()
│   └── wallet-reservation-cleanup.task.ts
│       ← @Cron every 10s
│       ← Calls WalletRepository.releaseExpiredReservations()
│
└── tests/
    ├── wallet.service.spec.ts
    ├── wallet-pool.service.spec.ts
    ├── wallet.controller.spec.ts
    ├── wallet-creation-result.handler.spec.ts
    └── wallet-family.resolver.spec.ts
```

---

## 9. Entity Schemas

### 9.1 `wallets` table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, generated | Internal identifier |
| `address` | VARCHAR(128) | NOT NULL, UNIQUE | Blockchain address string |
| `driver_family` | VARCHAR(32) | NOT NULL, INDEX | `WalletFamily` enum — replaces legacy `family` |
| `status` | VARCHAR(32) | NOT NULL, INDEX | `WalletStatus` enum |
| `customer_id` | VARCHAR(128) | NULLABLE, UNIQUE partial (with driver_family) | Opaque customer identifier |
| `assigned_at` | TIMESTAMPTZ | NULLABLE | Set once on assignment |
| `reservation_token` | VARCHAR(64) | NULLABLE, UNIQUE partial (WHERE NOT NULL) | UUID token; cleared after assign/release |
| `reserved_at` | TIMESTAMPTZ | NULLABLE | Set on → RESERVED; cleared on release/assign |
| `released_at` | TIMESTAMPTZ | NULLABLE | Set when reservation times out and wallet returns to AVAILABLE |
| `created_by_job_id` | UUID | NOT NULL, UNIQUE, FK → signer_jobs | The CREATE_WALLET SignerJob that produced this wallet |
| `public_key` | TEXT | NOT NULL, UNIQUE | Full public key hex — mandatory; returned by Signer |
| `public_key_fingerprint` | VARCHAR(128) | NULLABLE | SHA-256 fingerprint of public_key — audit shorthand |
| `signer_version` | VARCHAR(32) | NULLABLE | Signer binary version that generated this wallet |
| `previous_status` | VARCHAR(32) | NULLABLE | Snapshot of status before → LOCKED; cleared on unlock |
| `locked_at` | TIMESTAMPTZ | NULLABLE | Set when status → LOCKED |
| `lock_reason` | TEXT | NULLABLE | Human-readable reason |
| `compromised_at` | TIMESTAMPTZ | NULLABLE | Set when status → COMPROMISED |
| `archived_at` | TIMESTAMPTZ | NULLABLE | Set when status → ARCHIVED |
| `version` | INTEGER | NOT NULL | TypeORM `@VersionColumn` for optimistic lock |
| `created_at` | TIMESTAMPTZ | NOT NULL | Auto-set on insert |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Auto-set on update |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft-delete only |

**Indexes:**
- `(driver_family, status, created_at)` — composite BTREE; FIFO pool queries
- `(customer_id, driver_family)` — partial UNIQUE WHERE `customer_id IS NOT NULL`
- `(status, reserved_at)` — partial BTREE WHERE `status = 'RESERVED'`; reservation cleanup
- `address` — UNIQUE
- `created_by_job_id` — UNIQUE
- `reservation_token` — partial UNIQUE WHERE `reservation_token IS NOT NULL`
- `id` — partial BTREE WHERE `deleted_at IS NULL`

**Immutable columns (never updated after insert):**
`address`, `driver_family`, `created_by_job_id`, `public_key`, `public_key_fingerprint`, `created_at`

### 9.2 `wallet_pool_config` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `family` | VARCHAR(32) | UNIQUE — one row per family |
| `min_pool_size` | INTEGER | Default 500 |
| `replenish_threshold` | INTEGER | Default 100 |
| `batch_size` | INTEGER | Default 50 |
| `max_concurrent_jobs` | INTEGER | Default 10 |
| `reservation_ttl_seconds` | INTEGER | Default 30 — seconds before expired reservation is released |
| `is_active` | BOOLEAN | Allows disabling pool for a family |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

### 9.3 `wallet_audit_log` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `wallet_id` | UUID | FK → wallets |
| `action` | VARCHAR(64) | `WalletAuditAction` enum |
| `previous_status` | VARCHAR(32) | Snapshot before transition |
| `new_status` | VARCHAR(32) | Snapshot after transition |
| `actor` | VARCHAR(128) | Service name or API caller identity |
| `reason` | TEXT | NULLABLE — human context |
| `metadata` | JSONB | NULLABLE — additional context |
| `created_at` | TIMESTAMPTZ | Auto-set |

Audit log rows are **append-only** — no updates, no deletes, no soft-delete.

---

## 10. Services

### 10.1 `WalletService`

Single responsibility: wallet lifecycle state management.

| Method | Description |
|---|---|
| `createFromSignerResult(result)` | Persists a new AVAILABLE wallet from a completed CREATE_WALLET SignerJob result. Rejects result if `publicKey` is absent. |
| `assignWallet({ customerId, driverFamily })` | Executes `reserve → assign` inside one database transaction. Returns existing wallet if customer already has one for this family (idempotent). Throws `WalletPoolExhaustedError` if no AVAILABLE wallet exists. |
| `findById(id)` | Returns wallet or throws `WalletNotFoundError` |
| `findByCustomer({ customerId, driverFamily })` | Returns wallet assigned to customer for the given family |
| `findAllByCustomer(customerId)` | Returns all wallets across all families for a customer |
| `findByAddress(address)` | Returns wallet by blockchain address |
| `lockWallet({ walletId, reason })` | Transitions to LOCKED; saves previousStatus for unlock |
| `unlockWallet(walletId)` | Restores previousStatus from LOCKED |
| `compromiseWallet({ walletId, reason })` | Permanently decommissions wallet |
| `archiveWallet({ walletId, reason })` | Retires wallet; only from AVAILABLE or LOCKED |
| `getPoolStatus(driverFamily)` | Returns count of AVAILABLE wallets for the family |

All state transitions write an audit log entry.
All state transitions emit the corresponding domain event.
`WalletService` is the **ONLY** component that may call `WalletRepository` mutation methods.

### 10.2 `WalletPoolService`

Single responsibility: pool health monitoring and replenishment signalling.

| Method | Description |
|---|---|
| `checkAllFamilies()` | Iterates all active families; calls `checkThreshold(driverFamily)` for each |
| `checkThreshold(driverFamily)` | Compares available count against `replenishThreshold`; triggers replenishment if below |
| `replenish(driverFamily)` | Computes needed count; creates `CREATE_WALLET` SignerJobs via `SignerJobService` with `CreateWalletJobPayload` |
| `getConfig(driverFamily)` | Returns `WalletPoolConfig` for the family |
| `updateConfig(driverFamily, config)` | Updates threshold/batch parameters |

`WalletPoolService` NEVER reads from `wallets` table directly — it calls `WalletService.getPoolStatus()`.
`WalletPoolService` NEVER modifies wallet records.
`WalletPoolService` only creates `CREATE_WALLET` SignerJobs. It NEVER builds blockchain payloads.

### 10.3 `WalletFamilyResolver`

Single responsibility: `driverKey → WalletFamily` mapping.

| Method | Description |
|---|---|
| `resolve(driverKey)` | Returns `WalletFamily` for the given network driverKey |
| `isSupported(driverKey)` | Returns boolean — whether the family is supported |
| `getFamilyAlgorithm(family)` | Returns `SignAlgorithm` for the family |

This resolver is a pure function class — no database access, no async operations.
All mappings are static configuration. New chains require only a new entry here
and no other code change.

---

## 11. Repository Responsibilities

### 11.1 `WalletRepository`

| Method | SQL Behaviour |
|---|---|
| `findById(id)` | `WHERE id = $1 AND deleted_at IS NULL` |
| `findByAddress(address)` | `WHERE address = $1 AND deleted_at IS NULL` |
| `findByCustomer(customerId, driverFamily)` | `WHERE customer_id = $1 AND driver_family = $2 AND deleted_at IS NULL` |
| `findAllByCustomer(customerId)` | `WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY driver_family` |
| `findByDriverFamily(driverFamily, page)` | Paginated; `WHERE driver_family = $1 AND deleted_at IS NULL ORDER BY created_at DESC` |
| `countAvailable(driverFamily)` | `SELECT COUNT(*) WHERE driver_family = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL` |
| `countByStatus(driverFamily)` | `SELECT status, COUNT(*) WHERE driver_family = $1 AND deleted_at IS NULL GROUP BY status` |
| `findAll(query)` | Paginated; filtered by status, driverFamily, customerId |
| `existsByAddress(address)` | `SELECT 1 WHERE address = $1` (includes soft-deleted — address uniqueness is permanent) |
| `existsByCustomer(customerId, driverFamily)` | `SELECT 1 WHERE customer_id = $1 AND driver_family = $2 AND deleted_at IS NULL` |
| `save(data)` | `INSERT INTO wallets ...` — enforces `address` UNIQUE, `created_by_job_id` UNIQUE |
| `reserveWallet(driverFamily)` | Atomic: `SELECT ... FOR UPDATE SKIP LOCKED` + `UPDATE SET status='RESERVED', reservation_token=uuid(), reserved_at=NOW()` in single statement. Returns `{ walletId, reservationToken }` or null. |
| `assignWallet(params)` | `UPDATE SET status='ASSIGNED', customer_id=..., assigned_at=NOW(), reservation_token=NULL, reserved_at=NULL WHERE id=$1 AND reservation_token=$2 AND status='RESERVED'`. Throws `WalletReservationTokenMismatchError` if 0 rows updated. |
| `releaseExpiredReservations()` | `UPDATE SET status='AVAILABLE', reservation_token=NULL, reserved_at=NULL, released_at=NOW() WHERE status='RESERVED' AND reserved_at < NOW() - INTERVAL '$TTL seconds'`. Returns count of released rows. |
| `lockWallet(id, reason)` | `UPDATE SET status='LOCKED', locked_at=NOW(), lock_reason=$reason, previous_status=status WHERE id=$1 AND status NOT IN ('COMPROMISED','ARCHIVED')` |
| `unlockWallet(id)` | `UPDATE SET status=previous_status, locked_at=NULL, lock_reason=NULL, previous_status=NULL WHERE id=$1 AND status='LOCKED'` |
| `compromiseWallet(id, reason)` | `UPDATE SET status='COMPROMISED', compromised_at=NOW() WHERE id=$1 AND status NOT IN ('COMPROMISED','ARCHIVED')` |
| `archiveWallet(id, reason)` | `UPDATE SET status='ARCHIVED', archived_at=NOW() WHERE id=$1 AND status IN ('AVAILABLE','LOCKED')` |
| `softDelete(id)` | `UPDATE SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL` |

`reserveWallet` is the ONLY correct way to claim a wallet for assignment.
Calling `findByDriverFamily` + separate update for assignment is forbidden.

### 11.2 `WalletPoolConfigRepository`

| Method | SQL Behaviour |
|---|---|
| `findByFamily(family)` | `WHERE family = $1` |
| `findAllActive()` | `WHERE is_active = true` |
| `upsert(family, config)` | Insert or update on `family` conflict |

### 11.3 `WalletAuditLogRepository`

| Method | SQL Behaviour |
|---|---|
| `append(entry)` | `INSERT INTO wallet_audit_log ...` — never updates |
| `findByWallet(walletId, page)` | Paginated by `wallet_id` |
| `findByCustomer(customerId, page)` | Paginated by `customer_id` via join |

---

## 12. Event Contracts

### `WalletCreated`
```
{
  walletId: string         // internal UUID
  address: string          // blockchain address
  driverFamily: WalletFamily
  createdByJobId: string   // CREATE_WALLET job that produced this
  signerVersion: string    // Signer binary version
  createdAt: string        // ISO 8601
}
```

### `WalletAssigned`
```
{
  walletId: string
  address: string
  driverFamily: WalletFamily
  customerId: string       // opaque — no PII interpretation
  assignedAt: string       // ISO 8601
}
```

### `WalletLocked`
```
{
  walletId: string
  driverFamily: WalletFamily
  reason: string
  previousStatus: WalletStatus
  lockedAt: string
}
```

### `WalletUnlocked`
```
{
  walletId: string
  driverFamily: WalletFamily
  restoredStatus: WalletStatus
  unlockedAt: string
}
```

### `WalletCompromised`
```
{
  walletId: string
  address: string
  driverFamily: WalletFamily
  reason: string
  compromisedAt: string
}
```

### `WalletArchived`
```
{
  walletId: string
  driverFamily: WalletFamily
  reason: string
  archivedAt: string
}
```

### `WalletPoolLow`
```
{
  driverFamily: WalletFamily
  availableCount: number
  threshold: number
  detectedAt: string
}
```
*Triggers paging alert in production monitoring.*

### `WalletPoolReplenishmentRequested`
```
{
  driverFamily: WalletFamily
  jobsCreated: number
  targetCount: number
  requestedAt: string
}
```

### `WalletPoolReplenished`
```
{
  driverFamily: WalletFamily
  newAvailableCount: number
  addedCount: number
  replenishedAt: string
}
```

---

## 13. Public API Endpoints

All endpoints are prefixed `/v1/wallets`. Authentication: API Key + HMAC.

### Exchange-Facing

| Method | Path | Description |
|---|---|---|
| `POST` | `/wallets/assign` | Assign an available wallet to a customer |
| `GET` | `/wallets/customer/:customerId` | Get all wallets assigned to a customer |
| `GET` | `/wallets/customer/:customerId/family/:family` | Get the specific family wallet for a customer |
| `GET` | `/wallets/:walletId` | Get a wallet by internal ID |
| `GET` | `/wallets/address/:address` | Resolve address → wallet record |

### Admin / Internal

| Method | Path | Description |
|---|---|---|
| `POST` | `/wallets/:walletId/lock` | Lock a wallet with reason |
| `POST` | `/wallets/:walletId/unlock` | Unlock a wallet |
| `POST` | `/wallets/:walletId/compromise` | Mark wallet as compromised |
| `POST` | `/wallets/:walletId/archive` | Archive a wallet |
| `GET` | `/wallets/pool/status` | Pool counts per family |
| `GET` | `/wallets/pool/config` | Pool configuration per family |
| `PUT` | `/wallets/pool/config/:family` | Update pool parameters |
| `GET` | `/wallets` | Paginated list with filters |
| `GET` | `/wallets/:walletId/audit` | Audit log for a wallet |

---

## 14. Security Architecture

### 14.1 Exchange → Blockchain Backend

| Layer | Mechanism |
|---|---|
| Transport | HTTPS / TLS 1.3 |
| Authentication | API Key (`X-Api-Key` header) |
| Request integrity | HMAC-SHA256 signature over request body (`X-Hmac-Signature` header) |
| Rate limiting | Per API Key, per endpoint |
| Input validation | NestJS `ValidationPipe` (whitelist + forbidNonWhitelisted) |

The Wallet Module never stores the API Key — that is a gateway concern.

### 14.2 Offline Signer → Blockchain Backend

| Layer | Mechanism |
|---|---|
| Transport | WireGuard VPN tunnel |
| Mutual authentication | mTLS (client certificate per Signer instance) |
| Application auth | Bearer API Key (future: replaced by mTLS CN) |
| Payload integrity | HMAC-SHA256 `integritySignature` on every SignerPayload |
| Identity | `signerInstanceId` self-reported; future: derived from mTLS CN |

### 14.3 Private Key Isolation

Private keys exist **only** inside the Offline Signer.
The Backend never sees, stores, transmits, or requests private keys.
The Backend never computes or verifies blockchain signatures.
The Backend trusts the Signer as the sole cryptographic authority.

The Backend stores per wallet:
- `address` — derivable from the public key; not sensitive.
- `public_key` — the full public key; not sensitive (derivable from any on-chain transaction).
- `public_key_fingerprint` — a compact audit reference; not sensitive.
- `signer_version` — Signer binary version; audit metadata only.

No private key material ever touches the backend network under any circumstance.

---

## 15. `CreateWalletJobPayload` Contract

The only payload the Wallet Module sends to SignerJob for wallet creation:

```typescript
interface CreateWalletJobPayload {
  driverFamily: WalletFamily;  // which family to generate
  quantity: number;            // number of wallets requested (always 1 per job)
  reason: string;              // e.g. 'pool_replenishment'
}
```

**This payload contains:**
- No addresses
- No public keys
- No cryptographic material
- No signatures
- No transaction data
- No blockchain payloads

All blockchain payload generation belongs exclusively to the Offline Signer project.

---

## 16. Future Extension Points

| Feature | Extension Point | Notes |
|---|---|---|
| **HD Wallets** | `CreateWalletJobPayload.derivationPath` field (future) | Signer handles BIP-32/44 derivation; Backend stores path in entity |
| **Multi-Signature** | New `WalletType` enum: `MULTISIG`; new `wallet_signatories` table | Quorum logic owned by Signer |
| **MPC Wallets** | New `WalletType`: `MPC`; `WalletFamilyResolver` extended | MPC key shares distributed across multiple Signers |
| **Hardware Wallets (HSM)** | New Signer driver type; no backend change | Backend is hardware-agnostic |
| **Multiple Signers** | `SignerJob.signerGroupId` field (future) | Job routing to specific Signer group |
| **Cold/Hot Separation** | New `WalletTier` enum: `HOT`, `COLD`, `WARM` | Pool thresholds per tier |
| **Rust Signer** | Zero backend change — Signer is a client | Protocol is already Signer-agnostic |
| **Solana** | Add `SOLANA` to `WalletFamily`; add ED25519 pool config | Resolver updated; no service changes |
| **NEAR** | Same as Solana path | |
| **Watch-only wallets** | `WalletType.WATCH_ONLY`; `createdByJobId` nullable | Imported from external source |

---

## 17. Architecture Decision Records

See `ADR.md` in this directory.

---

## 18. Forbidden Patterns

The following are **permanently forbidden** in the Wallet Module:

- Importing `ethers`, `tronweb`, `bitcoinjs-lib`, or any blockchain SDK.
- Calling any RPC node.
- Generating private keys or key pairs.
- Storing or logging private keys.
- Storing wallet balances.
- Hardcoding `nationalId`, `iranianId`, or any identity-provider-specific field.
- Calling the Offline Signer directly (communication is exclusively via SignerJob).
- Circular imports with Sweep, Withdrawal, or Deposit modules.
- Business logic in repositories.
- Database access in controllers or services other than `WalletService`.
- Hard-deleting wallet records.
- Modifying `address`, `driver_family`, `created_by_job_id`, `public_key`, or `created_at` after creation.
- Direct `AVAILABLE → ASSIGNED` assignment skipping the `RESERVED` phase.
- Using `SignerPayloadBuilder` or any blockchain payload builder.
- Creating `CreateWalletJobPayload` with any field other than `driverFamily`, `quantity`, and `reason`.
- Using the old field name `family` — use `driverFamily` / `driver_family` exclusively.
- Using the old column name `signer_job_id` — use `created_by_job_id` exclusively.
