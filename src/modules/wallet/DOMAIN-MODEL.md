# Wallet Module — Phase 4 Step 2: Domain Model

Revision 1 — Frozen

This document defines the complete Wallet domain model, lifecycle state
machine, repository contracts, pool rules, reservation protocol, index
strategy, caching policy, and Architecture Decision Records.

No TypeORM. No implementation. No controllers. No services. No DTOs.
No blockchain logic. No signing logic. No RPC.

---

## Table of Contents

1. [Wallet Entity — Complete Field Specification](#1-wallet-entity)
2. [Wallet Status Enum](#2-wallet-status-enum)
3. [Wallet Family Enum](#3-wallet-family-enum)
4. [State Machine — Full Specification](#4-state-machine)
5. [Reservation Protocol](#5-reservation-protocol)
6. [Assignment Rules](#6-assignment-rules)
7. [Pool Rules](#7-pool-rules)
8. [Repository Contract](#8-repository-contract)
9. [Database Indexes](#9-database-indexes)
10. [Caching Strategy](#10-caching-strategy)
11. [Entity Relationships](#11-entity-relationships)
12. [Future Extensions](#12-future-extensions)
13. [Architecture Decision Records](#13-architecture-decision-records)

---

## 1. Wallet Entity

Table name: `wallets`

The Wallet entity is a pure ownership and address-identity record.
It carries no blockchain state, no balance, no transaction history,
no cryptographic material beyond the public key fingerprint used for audit.

### 1.1 Complete Field Specification

---

#### `id`
- **Type**: UUID
- **Required**: Yes
- **Mutable**: No (immutable after insert)
- **Unique**: Yes (PK)
- **Indexed**: Yes (PK index)
- **Responsibility**: Internal surrogate primary key. Never exposed to
  external systems as a routing key. Used for all internal foreign-key
  references (audit log, signer job, future deposit/withdrawal).
- **Generation**: Server-side UUID v4 at insert time.

---

#### `address`
- **Type**: VARCHAR(128)
- **Required**: Yes
- **Mutable**: No (immutable for lifetime of record)
- **Unique**: Yes (global unique constraint)
- **Indexed**: Yes (UNIQUE index)
- **Responsibility**: The blockchain address string as produced by the
  Offline Signer. For EVM wallets this is a 42-character `0x`-prefixed
  checksummed hex string. For TRON it is a Base58Check address.
  For Bitcoin Taproot it is a bech32m address. The backend stores the
  address as-is — it never derives, normalises, or transforms it.
- **Immutability rationale**: An address is a permanent on-chain identity.
  Once a deposit or sweep references it, it can never change. Changing
  an address would silently misdirect funds.
- **Stored case**: As received from the Signer. Comparison queries must
  account for case normalisation per family (EVM: checksum; others: as-is).

---

#### `driverFamily`
- **Column**: `driver_family`
- **Type**: VARCHAR(32) — values from `WalletFamily` enum
- **Required**: Yes
- **Mutable**: No (immutable for lifetime of record)
- **Unique**: No (many wallets per family)
- **Indexed**: Yes (single column + composite with status)
- **Responsibility**: Identifies the cryptographic address family this
  wallet belongs to. Determines which networks can use this address,
  which signing algorithm is required, and which pool this wallet belongs to.
  Replaces the previously named `family` column for naming consistency
  with the `driverKey` concept from the Network Module.
- **Immutability rationale**: Address derivation is family-specific. A
  secp256k1 address cannot be used as an Ed25519 address. The family is
  fixed at generation time and reflects a cryptographic reality.

---

#### `status`
- **Column**: `status`
- **Type**: VARCHAR(32) — values from `WalletStatus` enum
- **Required**: Yes
- **Mutable**: Yes (only via state machine transitions)
- **Default**: `AVAILABLE`
- **Indexed**: Yes (single column + composite with driverFamily)
- **Responsibility**: Current lifecycle position of this wallet.
  Governs which operations are permitted. Only `WalletService` may
  write this column. Repository `update()` persists but does not validate.
- **Valid values**: See §2 (WalletStatus Enum).

---

#### `customerId`
- **Column**: `customer_id`
- **Type**: VARCHAR(128)
- **Required**: No (nullable until assignment)
- **Mutable**: No — once set, never changed
- **Unique**: Composite UNIQUE with `driver_family` (one wallet per family per customer)
- **Indexed**: Yes (single column + composite with driverFamily)
- **Responsibility**: Opaque external customer identifier provided by the
  Exchange. The backend stores it verbatim and never interprets its format.
  Currently the Exchange sends Iranian National IDs, but the column type
  and validation are identity-provider agnostic.
- **Assignment rules**: Set atomically in the same transaction as
  `status → ASSIGNED`. Null before assignment. Immutable after assignment.
- **PII classification**: Treat as PII. Must never appear in logs.

---

#### `assignedAt`
- **Column**: `assigned_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable until assignment)
- **Mutable**: No — set once, never updated
- **Indexed**: No (low-cardinality lookup not required)
- **Responsibility**: Precise timestamp of when this wallet was permanently
  assigned to `customerId`. Set atomically with `status → ASSIGNED`.
  Used for audit, regulatory reporting, and dispute resolution.
  Always UTC. ISO 8601 in all representations.

---

#### `releasedAt`
- **Column**: `released_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable in normal lifecycle)
- **Mutable**: Yes (set exactly once, from RESERVED → AVAILABLE on timeout or failure)
- **Indexed**: Yes (used by reservation cleanup cron)
- **Responsibility**: Records the timestamp at which a RESERVED wallet was
  released back to AVAILABLE status. A non-null value indicates this wallet
  was once reserved but the assignment did not complete. Used for:
  - Reservation timeout detection by the cleanup cron.
  - Audit trail of failed assignment attempts.
  - Distinguishing wallets that were cleanly created (null) from those that
    experienced a reservation cycle.
- **Note**: `releasedAt` is only meaningful when `status = AVAILABLE` and
  `reservedAt` is also set. If `status = ASSIGNED`, this field is null.

---

#### `reservedAt`
- **Column**: `reserved_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable)
- **Mutable**: Yes (set on AVAILABLE → RESERVED; cleared on RESERVED → AVAILABLE)
- **Indexed**: Yes (composite with status for reservation cleanup query)
- **Responsibility**: Records when the wallet entered RESERVED status.
  Used to compute reservation age for timeout enforcement.
  The reservation TTL is 30 seconds (configurable). If `now() - reservedAt > TTL`,
  the reservation cleanup cron releases this wallet back to AVAILABLE.
- **Cleared**: Set to null when wallet transitions back to AVAILABLE.

---

#### `reservationToken`
- **Column**: `reservation_token`
- **Type**: VARCHAR(64)
- **Required**: No (nullable)
- **Mutable**: Yes (set on reservation; cleared on release or assignment)
- **Unique**: Yes (partial unique index: WHERE reservation_token IS NOT NULL)
- **Indexed**: Yes (for token lookup)
- **Responsibility**: A UUID v4 token generated by the service at reservation
  time. The caller must present this token to complete assignment. Prevents
  a different caller from accidentally completing another caller's reservation.
  Cleared (set to null) when the wallet is assigned or released.

---

#### `createdByJobId`
- **Column**: `created_by_job_id`
- **Type**: UUID
- **Required**: Yes (every wallet must trace to a CREATE_WALLET SignerJob)
- **Mutable**: No (immutable after insert)
- **Unique**: Yes (one wallet per SignerJob result)
- **Indexed**: Yes (FK + audit lookup)
- **Responsibility**: Foreign key to `signer_jobs.id`. Links this wallet to
  the exact `CREATE_WALLET` SignerJob that produced it. Provides a complete
  audit chain from wallet address back to Signer identity and version.
  Required — a wallet without a job origin is architecturally invalid.

---

#### `publicKey`
- **Column**: `public_key`
- **Type**: TEXT
- **Required**: Yes
- **Mutable**: No (immutable after insert)
- **Unique**: Yes (one address per public key)
- **Indexed**: No (not queried; audit-only)
- **Responsibility**: The full uncompressed or compressed public key hex string
  as returned by the Offline Signer in the CREATE_WALLET result.
  The backend stores it verbatim for:
  - Audit trail linking address to key material without storing the private key.
  - Future address verification (derive expected address from public key).
  - Multi-signer coordination (future MPC/MultiSig).
  - Regulatory disclosure requirements.
- **Security**: The public key is not sensitive — it is derivable from any
  on-chain transaction. However, it must never be confused with the private key.
  The private key is never transmitted to or stored by the backend.

---

#### `publicKeyFingerprint`
- **Column**: `public_key_fingerprint`
- **Type**: VARCHAR(128)
- **Required**: No (nullable — populated from Signer result)
- **Mutable**: No (immutable after insert)
- **Indexed**: No
- **Responsibility**: A compact SHA-256 fingerprint of the public key.
  Format: `sha256:<hex>`. Used in audit logs and Signer result validation
  without transmitting the full public key. Provides a tamper-evident
  reference to the key used at generation time.

---

#### `signerVersion`
- **Column**: `signer_version`
- **Type**: VARCHAR(32)
- **Required**: No (nullable — populated from Signer result)
- **Mutable**: No (immutable after insert)
- **Indexed**: No (filter queries possible in future; add index if needed)
- **Responsibility**: The version string of the Offline Signer binary that
  generated this wallet. Used to:
  - Track which Signer version produced which wallets.
  - Support incident response if a Signer version has a known vulnerability.
  - Audit compliance for key generation provenance.

---

#### `lockedAt`
- **Column**: `locked_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable)
- **Mutable**: Yes (set on AVAILABLE/ASSIGNED → LOCKED; cleared on unlock)
- **Indexed**: No
- **Responsibility**: Timestamp of when this wallet was locked. Set when
  status transitions to LOCKED. Cleared (null) when unlocked.
  Used in audit and for operator reporting.

---

#### `lockReason`
- **Column**: `lock_reason`
- **Type**: TEXT
- **Required**: No (nullable)
- **Mutable**: Yes (set on lock; cleared on unlock)
- **Indexed**: No
- **Responsibility**: Human-readable reason provided by the operator when
  locking the wallet. Examples: "Suspicious withdrawal pattern detected",
  "Regulatory hold". Stored for audit. Must never contain PII or private key material.

---

#### `previousStatus`
- **Column**: `previous_status`
- **Type**: VARCHAR(32)
- **Required**: No (nullable)
- **Mutable**: Yes (set on → LOCKED; cleared on unlock)
- **Indexed**: No
- **Responsibility**: Snapshot of the status immediately before transitioning
  to LOCKED. Required so that `unlockWallet()` can restore the correct prior
  status without inferring it from history. Avoids querying the audit log
  on every unlock. Cleared after unlock restores the status.

---

#### `compromisedAt`
- **Column**: `compromised_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable)
- **Mutable**: No — set once on COMPROMISED transition; never cleared
- **Indexed**: No
- **Responsibility**: Terminal timestamp. Set when status → COMPROMISED.
  Never null if status = COMPROMISED. Used for incident timeline reconstruction.

---

#### `archivedAt`
- **Column**: `archived_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable)
- **Mutable**: No — set once on ARCHIVED transition; never cleared
- **Indexed**: No
- **Responsibility**: Terminal timestamp. Set when status → ARCHIVED.
  Used for pool audit and data retention policy enforcement.

---

#### `version`
- **Column**: `version`
- **Type**: INTEGER
- **Required**: Yes
- **Default**: 1
- **Mutable**: Yes (auto-incremented on every `update()` call)
- **Indexed**: No (part of optimistic lock mechanism, not a query filter)
- **Responsibility**: Optimistic concurrency lock version counter.
  Every `update()` increments this value. If two concurrent transactions
  attempt to update the same wallet, one will fail with an
  `OptimisticLockVersionMismatchError`. The service must handle this
  by retrying the read-modify-write cycle.
  Critical for race-condition-free assignment and reservation.

---

#### `createdAt`
- **Column**: `created_at`
- **Type**: TIMESTAMPTZ
- **Required**: Yes
- **Mutable**: No (immutable after insert)
- **Default**: `NOW()` at insert
- **Indexed**: Yes (composite with driverFamily and status for FIFO pool ordering)
- **Responsibility**: The timestamp at which this wallet row was persisted.
  Determines FIFO ordering within the pool — oldest AVAILABLE wallets are
  assigned first to prevent pool freshness bias. Also used for pool
  age analysis and capacity planning.

---

#### `updatedAt`
- **Column**: `updated_at`
- **Type**: TIMESTAMPTZ
- **Required**: Yes
- **Mutable**: Yes (auto-updated by ORM on every write)
- **Default**: `NOW()` at insert; maintained by trigger or ORM
- **Indexed**: No
- **Responsibility**: Last modification timestamp. Used for change detection
  in administrative tooling and backup systems.

---

#### `deletedAt`
- **Column**: `deleted_at`
- **Type**: TIMESTAMPTZ
- **Required**: No (nullable)
- **Mutable**: Yes (set once on soft-delete; never cleared)
- **Indexed**: Yes (partial index WHERE deleted_at IS NULL on all queries)
- **Responsibility**: Soft-delete marker. All normal queries include
  `WHERE deleted_at IS NULL`. A wallet is never hard-deleted.
  Soft-delete is reserved for data retention workflows only;
  it is NOT a lifecycle transition and must not be used to remove
  active wallets from the pool.

---

### 1.2 Field Summary Table

| Field | Column | Required | Mutable | Unique | Indexed | Notes |
|---|---|---|---|---|---|---|
| `id` | `id` | Yes | No | Yes (PK) | Yes | Surrogate key |
| `address` | `address` | Yes | No | Yes | Yes | Global unique |
| `driverFamily` | `driver_family` | Yes | No | No | Yes | Enum |
| `status` | `status` | Yes | Yes | No | Yes | Enum |
| `customerId` | `customer_id` | No | No* | Composite | Yes | *Set once |
| `assignedAt` | `assigned_at` | No | No* | No | No | *Set once |
| `releasedAt` | `released_at` | No | Yes | No | Yes | Reservation cleanup |
| `reservedAt` | `reserved_at` | No | Yes | No | Yes | Reservation timeout |
| `reservationToken` | `reservation_token` | No | Yes | Partial | Yes | Cleared on assign/release |
| `createdByJobId` | `created_by_job_id` | Yes | No | Yes | Yes | FK → signer_jobs |
| `publicKey` | `public_key` | Yes | No | Yes | No | Full pubkey hex |
| `publicKeyFingerprint` | `public_key_fingerprint` | No | No | No | No | SHA-256 fingerprint |
| `signerVersion` | `signer_version` | No | No | No | No | Audit |
| `lockedAt` | `locked_at` | No | Yes | No | No | Set on lock |
| `lockReason` | `lock_reason` | No | Yes | No | No | Human text |
| `previousStatus` | `previous_status` | No | Yes | No | No | Unlock helper |
| `compromisedAt` | `compromised_at` | No | No* | No | No | *Terminal |
| `archivedAt` | `archived_at` | No | No* | No | No | *Terminal |
| `version` | `version` | Yes | Yes | No | No | Optimistic lock |
| `createdAt` | `created_at` | Yes | No | No | Yes | FIFO ordering |
| `updatedAt` | `updated_at` | Yes | Yes | No | No | ORM-managed |
| `deletedAt` | `deleted_at` | No | Yes | No | Yes | Soft-delete |

### 1.3 Permanently Excluded Fields

The following fields are **architecturally forbidden** on the Wallet entity.
Adding any of these requires a ratified ADR and a breaking migration.

| Field | Reason |
|---|---|
| `balance` / `availableBalance` | Balance is a blockchain state concern, not an ownership record. See ADR-WM-D-003. |
| `privateKey` | Private keys never leave the Offline Signer. See ADR-WM-D-005. |
| `mnemonic` / `seedPhrase` | Same as private key. Terminal security violation. |
| `seed` | Same as private key. |
| `nonce` | Chain nonce is a transaction-sequencing concern, not wallet ownership. |
| `transactionCount` | Derived from chain state, not an ownership property. |
| `nationalId` / `iranianId` | Identity-provider coupling. The backend is identity-agnostic. See ADR-WM-D-004. |
| `chainId` | Chain context is provided at call time by the Network Module. |
| `network` / `networkId` | A wallet address is valid across all networks in its family. No per-network column. |
| `derivationPath` | HD wallet support is a future extension (§12). Not in current scope. |

---

## 2. Wallet Status Enum

```
enum WalletStatus {
  AVAILABLE   = 'AVAILABLE'
  RESERVED    = 'RESERVED'
  ASSIGNED    = 'ASSIGNED'
  LOCKED      = 'LOCKED'
  COMPROMISED = 'COMPROMISED'
  ARCHIVED    = 'ARCHIVED'
}
```

| Value | Meaning |
|---|---|
| `AVAILABLE` | In the pool; ready for assignment to a customer |
| `RESERVED` | Temporarily held for an in-progress assignment transaction; released if not completed within TTL |
| `ASSIGNED` | Permanently assigned to a customer; ownership is immutable |
| `LOCKED` | Temporarily frozen; no operations permitted; reversible |
| `COMPROMISED` | Permanently decommissioned; private key may be exposed; terminal |
| `ARCHIVED` | Retired from active use; historical record only; terminal |

---

## 3. Wallet Family Enum

```
enum WalletFamily {
  EVM     = 'EVM'
  TRON    = 'TRON'
  BITCOIN = 'BITCOIN'
  SOLANA  = 'SOLANA'
  NEAR    = 'NEAR'
}
```

| Family | Sign Algorithm | Address Derivation | Networks |
|---|---|---|---|
| `EVM` | ECDSA_SECP256K1 | keccak256(pubkey)[12:] as 0x hex | Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche, all future EVM |
| `TRON` | ECDSA_SECP256K1 | keccak256(pubkey)[12:] + Base58Check | Tron |
| `BITCOIN` | SCHNORR | BIP-340 Taproot (P2TR) | Bitcoin |
| `SOLANA` | ED25519 | pubkey bytes as Base58 | Solana |
| `NEAR` | ED25519 | pubkey bytes as Base58 | NEAR |

New families are added by extending this enum and adding one entry in `WalletFamilyResolver`.
No other component requires change.

---

## 4. State Machine — Full Specification

### 4.1 Transition Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                  AVAILABLE                           │
                    └────────┬─────────┬────────────┬────────────┬────────┘
                             │         │            │            │
                    [reserve()]  [lock()]  [compromise()] [archive()]
                             │         │            │            │
                             ▼         ▼            ▼            ▼
                        RESERVED    LOCKED    COMPROMISED    ARCHIVED
                             │         │       (terminal)   (terminal)
             [assign()]      │  [unlock()]
             [release()]     │         │
                  │          │         ▼
                  ▼          │      AVAILABLE (restored)
               ASSIGNED ◄────┘
            (via reservation)
                  │
          [lock()]│[compromise()]
                  │
               LOCKED
                  │
          [unlock()]│[compromise()]│[archive()]
                  │
         AVAILABLE/ASSIGNED  COMPROMISED  ARCHIVED
```

### 4.2 Allowed Transitions Table

| From | Action | To | Condition |
|---|---|---|---|
| `AVAILABLE` | `reserve()` | `RESERVED` | Pool has available wallets; reservation token generated |
| `AVAILABLE` | `lock()` | `LOCKED` | Operator provides reason; previousStatus saved |
| `AVAILABLE` | `compromise()` | `COMPROMISED` | Operator confirms; terminal |
| `AVAILABLE` | `archive()` | `ARCHIVED` | Operator confirms; terminal |
| `RESERVED` | `assign()` | `ASSIGNED` | Valid reservationToken presented; customerId provided |
| `RESERVED` | `release()` | `AVAILABLE` | TTL expired OR explicit release; releasedAt set |
| `ASSIGNED` | `lock()` | `LOCKED` | Operator provides reason; previousStatus saved |
| `ASSIGNED` | `compromise()` | `COMPROMISED` | Operator confirms; terminal |
| `LOCKED` | `unlock()` | `AVAILABLE` or `ASSIGNED` | Restores `previousStatus` |
| `LOCKED` | `compromise()` | `COMPROMISED` | Operator confirms; terminal |
| `LOCKED` | `archive()` | `ARCHIVED` | Operator confirms; only if `previousStatus = AVAILABLE` |

### 4.3 Rejected Transitions Table

| Attempted | From | Reason |
|---|---|---|
| `assign()` | `AVAILABLE` | Must go through `RESERVED` first (race-condition prevention) |
| `assign()` | `LOCKED` | Wallet is frozen |
| `assign()` | `ASSIGNED` | Already assigned; `WalletAlreadyAssignedError` |
| `assign()` | `COMPROMISED` | Terminal; `WalletInvalidStatusError` |
| `assign()` | `ARCHIVED` | Terminal; `WalletInvalidStatusError` |
| `assign()` without token | `RESERVED` | Token mismatch; `WalletReservationTokenMismatchError` |
| `unlock()` | `AVAILABLE` | Not locked; `WalletInvalidStatusError` |
| `unlock()` | `ASSIGNED` | Not locked; `WalletInvalidStatusError` |
| `unlock()` | `COMPROMISED` | Terminal |
| `unlock()` | `ARCHIVED` | Terminal |
| Any transition | `COMPROMISED` | Terminal; `WalletTerminalStatusError` |
| Any transition | `ARCHIVED` | Terminal; `WalletTerminalStatusError` |
| `archive()` from `ASSIGNED` | `ASSIGNED` | Assigned wallets cannot be archived while owned |
| `reassign()` (any) | `ASSIGNED` | Reassignment is permanently forbidden; `WalletAlreadyAssignedError` |

### 4.4 Terminal State Policy

`COMPROMISED` and `ARCHIVED` are permanently terminal.

- No code path may transition out of either state.
- The repository `update()` method must reject any write that attempts to
  change `status` from a terminal value.
- An attempt to transition a terminal wallet emits a
  `WalletIllegalTransitionAttempted` audit log entry and throws
  `WalletTerminalStatusError`.

### 4.5 Recovery Policy

| Scenario | Policy |
|---|---|
| Compromised wallet with assigned customer | Create a new wallet; re-assign via manual operator flow; notify Exchange |
| Locked wallet needing reassignment | Unlock first, then follow normal assignment flow |
| Reservation expired before assignment completed | Reservation cleanup cron releases wallet; caller retries |
| Pool exhaustion (all AVAILABLE wallets gone) | Emit `WalletPoolExhausted` event; alert operator; block new assignments |

---

## 5. Reservation Protocol

### 5.1 Why Reservation Exists

Direct AVAILABLE → ASSIGNED in a single step is vulnerable to a race
condition where two concurrent callers select the same AVAILABLE wallet
before either has written. Reservation introduces an intermediate state
that is atomically claimed using `FOR UPDATE SKIP LOCKED`, making
concurrent assignment safe without application-level locking.

See ADR-WM-D-002.

### 5.2 Reservation Flow

```
[Caller: WalletService.reserveWallet({ driverFamily })]
        │
        ▼
WalletRepository.reserveWallet(driverFamily)
  ─ SELECT ... WHERE driver_family = $1
      AND status = 'AVAILABLE'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
  ─ UPDATE wallets SET
      status = 'RESERVED',
      reservation_token = uuid(),
      reserved_at = NOW(),
      version = version + 1
    WHERE id = <selected id>
      AND version = <read version>   ← optimistic lock check
        │
        ├─ 0 rows updated → concurrent claim, retry once
        │
        ▼
Return: { walletId, reservationToken, reservedAt }
        │
        ▼
[Caller proceeds with business logic (e.g. validate customerId)]
        │
        ▼
WalletRepository.assignWallet({ walletId, reservationToken, customerId })
  ─ UPDATE wallets SET
      status = 'ASSIGNED',
      customer_id = $customerId,
      assigned_at = NOW(),
      reservation_token = NULL,
      reserved_at = NULL,
      version = version + 1
    WHERE id = $walletId
      AND reservation_token = $reservationToken   ← token ownership check
      AND status = 'RESERVED'
```

### 5.3 Reservation Timeout

- TTL: **30 seconds** (configurable per `wallet_pool_config.reservation_ttl_seconds`).
- A cleanup cron runs every **10 seconds**.
- Any wallet where `status = 'RESERVED' AND reserved_at < NOW() - INTERVAL 'TTL seconds'`
  is released back to AVAILABLE:

```
WalletRepository.releaseExpiredReservations()
  UPDATE wallets SET
    status = 'AVAILABLE',
    reservation_token = NULL,
    reserved_at = NULL,
    released_at = NOW(),
    version = version + 1
  WHERE status = 'RESERVED'
    AND reserved_at < NOW() - INTERVAL '$TTL seconds'
```

- `released_at` is set to record that this wallet went through a failed
  reservation cycle. This is used in pool age analysis.

### 5.4 Race-Condition Prevention

Three independent mechanisms prevent duplicate assignment:

| Layer | Mechanism |
|---|---|
| Database | `FOR UPDATE SKIP LOCKED` — only one transaction can hold the row lock |
| Optimistic lock | `version` column — concurrent updates to the same row fail |
| Token ownership | `reservation_token` check in `assignWallet()` — prevents a different caller from completing someone else's reservation |
| Unique constraint | `(customer_id, driver_family)` UNIQUE — database-level enforcement of one wallet per customer per family |

---

## 6. Assignment Rules

1. **A wallet may be assigned only once.** Once `status = ASSIGNED`,
   `customer_id` is frozen for the lifetime of the record.

2. **A wallet can never change owner.** Reassignment is permanently
   forbidden. Any attempt throws `WalletAlreadyAssignedError`.

3. **A wallet can never return to AVAILABLE after assignment.**
   The `ASSIGNED → AVAILABLE` transition does not exist in the state machine.

4. **`customerId` becomes immutable after assignment.**
   The repository `update()` method must never overwrite `customer_id`
   or `assigned_at` once they are non-null.

5. **Assignment requires a valid reservationToken.**
   Direct AVAILABLE → ASSIGNED skipping reservation is rejected at
   the service layer.

6. **One wallet per customer per family.**
   The `(customer_id, driver_family)` UNIQUE constraint enforces this
   at the database level. The service also checks before reservation.

7. **Assignment is idempotent for the same customerId + family.**
   If `findByCustomer(customerId, family)` returns an existing ASSIGNED
   wallet, the service returns it without creating a new reservation.

---

## 7. Pool Rules

### 7.1 Minimum Pool Size

| Parameter | Default | Notes |
|---|---|---|
| `min_pool_size` | 500 per family | Target count after replenishment |
| `replenish_threshold` | 100 per family | Trigger when AVAILABLE < this |
| `batch_size` | 50 | CREATE_WALLET jobs per replenishment cycle |
| `max_concurrent_jobs` | 10 | Concurrent active CREATE_WALLET SignerJobs |
| `reservation_ttl_seconds` | 30 | Seconds before expired reservation is released |

### 7.2 Pool Monitoring

- Pool status is evaluated every 60 seconds by the scheduled `WalletPoolCheckTask`.
- Count includes only wallets where `status = 'AVAILABLE' AND deleted_at IS NULL`.
- `RESERVED` wallets are **excluded** from the available count (they may be released
  back, but until released they must not be counted as available to prevent
  double-assignment).
- When count < `replenish_threshold`, emit `WalletPoolLow` and trigger replenishment.
- When count reaches 0, emit `WalletPoolExhausted` and block new assignment attempts.

### 7.3 Duplicate Prevention

- `address` UNIQUE constraint prevents inserting the same blockchain address twice.
- `created_by_job_id` UNIQUE constraint prevents two wallets being created
  from the same SignerJob result.
- `(customer_id, driver_family)` UNIQUE constraint prevents a customer from
  having two wallets in the same family.

### 7.4 Wallet Uniqueness

A wallet is globally unique on:
- `address` (one record per blockchain address in the entire system)
- `created_by_job_id` (one wallet per CREATE_WALLET job result)

### 7.5 Pool Ordering

Wallets are assigned in FIFO order by `created_at ASC` within each family.
This ensures the oldest wallets are consumed first, maintaining a fresh pool.

---

## 8. Repository Contract

The repository is a pure persistence layer. No business rules. No events.
No state-machine validation. Every method has a single, clear data concern.

### 8.1 Read Methods

---

#### `findById(id: string): Promise<Wallet | null>`
Query: `SELECT * FROM wallets WHERE id = $1 AND deleted_at IS NULL`
Use: Any lookup by internal ID. Returns null if not found.

---

#### `findByAddress(address: string): Promise<Wallet | null>`
Query: `SELECT * FROM wallets WHERE address = $1 AND deleted_at IS NULL`
Use: Resolve incoming blockchain transaction to wallet record.
Address comparison must respect family-specific case rules.

---

#### `findByCustomer(customerId: string, driverFamily: WalletFamily): Promise<Wallet | null>`
Query: `SELECT * FROM wallets WHERE customer_id = $1 AND driver_family = $2 AND deleted_at IS NULL`
Use: Fetch the wallet assigned to a customer for a specific family.

---

#### `findAllByCustomer(customerId: string): Promise<Wallet[]>`
Query: `SELECT * FROM wallets WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY driver_family`
Use: Return all wallets across all families for a customer.

---

#### `findByDriverFamily(driverFamily: WalletFamily, page: PaginationParams): Promise<PaginatedResult<Wallet>>`
Query: `SELECT * FROM wallets WHERE driver_family = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $limit OFFSET $offset`
Use: Administrative listing by family.

---

#### `findAvailable(driverFamily: WalletFamily, page: PaginationParams): Promise<PaginatedResult<Wallet>>`
Query: `SELECT * FROM wallets WHERE driver_family = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL ORDER BY created_at ASC`
Use: Administrative pool health view. NOT used for assignment (use `reserveWallet` instead).

---

#### `findLocked(): Promise<Wallet[]>`
Query: `SELECT * FROM wallets WHERE status = 'LOCKED' AND deleted_at IS NULL ORDER BY locked_at ASC`
Use: Operator dashboard; locked wallet review.

---

#### `findCompromised(): Promise<Wallet[]>`
Query: `SELECT * FROM wallets WHERE status = 'COMPROMISED' AND deleted_at IS NULL ORDER BY compromised_at DESC`
Use: Security incident review.

---

#### `findReserved(): Promise<Wallet[]>`
Query: `SELECT * FROM wallets WHERE status = 'RESERVED' AND deleted_at IS NULL ORDER BY reserved_at ASC`
Use: Reservation health monitoring and cleanup cron.

---

#### `countAvailable(driverFamily: WalletFamily): Promise<number>`
Query: `SELECT COUNT(*) FROM wallets WHERE driver_family = $1 AND status = 'AVAILABLE' AND deleted_at IS NULL`
Use: Pool threshold check by `WalletPoolService`. Critical path — must be fast.

---

#### `countByStatus(driverFamily: WalletFamily): Promise<Record<WalletStatus, number>>`
Query: `SELECT status, COUNT(*) FROM wallets WHERE driver_family = $1 AND deleted_at IS NULL GROUP BY status`
Use: Pool status dashboard endpoint.

---

#### `exists(id: string): Promise<boolean>`
Query: `SELECT 1 FROM wallets WHERE id = $1 AND deleted_at IS NULL LIMIT 1`
Use: Existence check without loading the full row.

---

#### `existsByAddress(address: string): Promise<boolean>`
Query: `SELECT 1 FROM wallets WHERE address = $1 LIMIT 1`
(Note: includes soft-deleted rows intentionally — address uniqueness is global and permanent.)
Use: Prevent duplicate address registration.

---

#### `existsByCustomer(customerId: string, driverFamily: WalletFamily): Promise<boolean>`
Query: `SELECT 1 FROM wallets WHERE customer_id = $1 AND driver_family = $2 AND deleted_at IS NULL LIMIT 1`
Use: Pre-assignment check to enforce one-wallet-per-customer-per-family.

---

### 8.2 Write Methods

---

#### `save(data: CreateWalletData): Promise<Wallet>`
Query: `INSERT INTO wallets (...) VALUES (...) RETURNING *`
Use: Persist a new wallet from a CREATE_WALLET SignerJob result.
Enforces: `address` UNIQUE, `created_by_job_id` UNIQUE.
Throws on duplicate: caller handles `UniqueConstraintViolationError`.

Input shape:
```
{
  address: string
  driverFamily: WalletFamily
  status: AVAILABLE
  createdByJobId: string
  publicKey: string
  publicKeyFingerprint: string | null
  signerVersion: string | null
}
```
All other fields default to null or are auto-generated by the database.

---

#### `reserveWallet(driverFamily: WalletFamily): Promise<ReservedWallet | null>`
Query:
```sql
UPDATE wallets
SET status = 'RESERVED',
    reservation_token = gen_random_uuid(),
    reserved_at = NOW(),
    version = version + 1
WHERE id = (
  SELECT id FROM wallets
  WHERE driver_family = $1
    AND status = 'AVAILABLE'
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING id, reservation_token, reserved_at
```
Returns null if no AVAILABLE wallet exists for the family.
This is the only correct way to claim a wallet for assignment.
Calling code must NOT use `findAvailable` + separate update.

---

#### `assignWallet(params: AssignWalletParams): Promise<Wallet>`
Query:
```sql
UPDATE wallets
SET status = 'ASSIGNED',
    customer_id = $customerId,
    assigned_at = NOW(),
    reservation_token = NULL,
    reserved_at = NULL,
    version = version + 1
WHERE id = $walletId
  AND reservation_token = $reservationToken
  AND status = 'RESERVED'
  AND deleted_at IS NULL
RETURNING *
```
Throws `WalletReservationTokenMismatchError` if 0 rows updated.
This check atomically validates token ownership and status.

---

#### `lockWallet(id: string, reason: string): Promise<Wallet>`
Query: `UPDATE wallets SET status='LOCKED', locked_at=NOW(), lock_reason=$reason, previous_status=status, version=version+1 WHERE id=$1 AND status NOT IN ('COMPROMISED','ARCHIVED') AND deleted_at IS NULL RETURNING *`
Throws `WalletTerminalStatusError` if wallet is in a terminal state.

---

#### `unlockWallet(id: string): Promise<Wallet>`
Query: `UPDATE wallets SET status=previous_status, locked_at=NULL, lock_reason=NULL, previous_status=NULL, version=version+1 WHERE id=$1 AND status='LOCKED' AND deleted_at IS NULL RETURNING *`
Throws `WalletInvalidStatusError` if wallet is not LOCKED.

---

#### `compromiseWallet(id: string, reason: string): Promise<Wallet>`
Query: `UPDATE wallets SET status='COMPROMISED', compromised_at=NOW(), version=version+1 WHERE id=$1 AND status NOT IN ('COMPROMISED','ARCHIVED') AND deleted_at IS NULL RETURNING *`

---

#### `archiveWallet(id: string, reason: string): Promise<Wallet>`
Query: `UPDATE wallets SET status='ARCHIVED', archived_at=NOW(), version=version+1 WHERE id=$1 AND status IN ('AVAILABLE','LOCKED') AND deleted_at IS NULL RETURNING *`
Note: ASSIGNED wallets cannot be archived while owned. COMPROMISED wallets cannot be archived.

---

#### `releaseExpiredReservations(): Promise<number>`
Query: `UPDATE wallets SET status='AVAILABLE', reservation_token=NULL, reserved_at=NULL, released_at=NOW(), version=version+1 WHERE status='RESERVED' AND reserved_at < NOW() - INTERVAL '$TTL seconds' RETURNING id`
Returns count of released wallets.
Called by the reservation cleanup cron every 10 seconds.

---

#### `softDelete(id: string): Promise<void>`
Query: `UPDATE wallets SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`
For data retention workflows only. Never used as a lifecycle transition.

---

## 9. Database Indexes

### 9.1 Primary and Unique

| Index | Columns | Type | Reason |
|---|---|---|---|
| `wallets_pkey` | `id` | UNIQUE (PK) | Row identity |
| `wallets_address_unique` | `address` | UNIQUE | Global address uniqueness; deposit resolution |
| `wallets_created_by_job_id_unique` | `created_by_job_id` | UNIQUE | One wallet per SignerJob |
| `wallets_customer_family_unique` | `(customer_id, driver_family)` WHERE `customer_id IS NOT NULL` | PARTIAL UNIQUE | One wallet per customer per family |
| `wallets_reservation_token_unique` | `reservation_token` WHERE `reservation_token IS NOT NULL` | PARTIAL UNIQUE | Token uniqueness without nulls competing |

### 9.2 Query Performance Indexes

| Index | Columns | Type | Query Pattern |
|---|---|---|---|
| `wallets_family_status_created_idx` | `(driver_family, status, created_at)` | BTREE | Pool FIFO: `WHERE family=? AND status='AVAILABLE' ORDER BY created_at ASC` |
| `wallets_status_idx` | `status` | BTREE | Status filter queries |
| `wallets_customer_id_idx` | `customer_id` | BTREE | Customer lookup |
| `wallets_created_by_job_id_idx` | `created_by_job_id` | BTREE | Job result audit |
| `wallets_not_deleted_idx` | `id` WHERE `deleted_at IS NULL` | PARTIAL BTREE | Baseline filter for all operational queries |
| `wallets_reserved_cleanup_idx` | `(status, reserved_at)` WHERE `status='RESERVED'` | PARTIAL BTREE | Reservation timeout cron |
| `wallets_released_at_idx` | `released_at` WHERE `released_at IS NOT NULL` | PARTIAL BTREE | Pool age analysis queries |

### 9.3 Index Rationale

**`(driver_family, status, created_at)` composite index** is the most
critical. It powers the FIFO pool query inside `reserveWallet()` which
is called on every customer assignment. Without this index, the query
scans the entire table for large pools.

**`(customer_id, driver_family)` partial unique index** (WHERE `customer_id IS NOT NULL`)
enforces the one-wallet-per-customer-per-family invariant at the database
level. The partial condition prevents the index from indexing the large
set of AVAILABLE wallets (which have null customer_id), keeping the
index small and fast.

**`(status, reserved_at)` partial index** (WHERE `status='RESERVED'`) powers
the reservation cleanup cron. Without it, the cron scans all wallets.

**`deleted_at IS NULL` partial index** is a baseline optimisation. PostgreSQL
partial indexes exclude deleted rows from the index entirely, making
all operational queries faster on tables with any soft-deleted rows.

---

## 10. Caching Strategy

### 10.1 Cacheable Queries

| Query | Cache Key | TTL | Invalidation |
|---|---|---|---|
| `countAvailable(family)` | `wallet:pool:count:{family}` | 30 seconds | On `WalletCreated`, `WalletAssigned`, `WalletArchived` events |
| `countByStatus(family)` | `wallet:pool:status:{family}` | 30 seconds | Same as above |
| Pool config (`wallet_pool_config`) | `wallet:pool:config:{family}` | 5 minutes | On config `PUT` admin endpoint |
| `findByAddress(address)` for assigned wallets | `wallet:address:{address}` | 10 minutes | On `WalletLocked`, `WalletCompromised`, `WalletArchived` events |

**Rationale**: Pool counts are read every 60 seconds by the cron and on
every pool status API call. Caching for 30 seconds reduces database load
without meaningfully delaying threshold detection.

### 10.2 Must-Never-Be-Cached

| Query | Reason |
|---|---|
| `reserveWallet()` | Must always read the live row to enforce `FOR UPDATE SKIP LOCKED` |
| `assignWallet()` | Must always write with the live version; cache would break optimistic lock |
| `findByCustomer()` during assignment | Must reflect real-time state to prevent double-assignment |
| `exists()` during deduplication checks | Stale cache would allow duplicate address insertion |
| Any query inside a database transaction | Transactions must bypass cache entirely |

### 10.3 Cache Invalidation Rules

- All cache invalidation is **event-driven**: domain events trigger cache eviction.
- Cache must be invalidated **after** the database write commits, not before.
- Cache invalidation failures must be logged but must never block the
  database write from completing.
- Cache is **a performance layer only** — the system must be correct without it.

---

## 11. Entity Relationships

### 11.1 Current Relationships

```
wallets
  └── signer_jobs (created_by_job_id → signer_jobs.id)
       Many-to-one: many wallets could theoretically reference one job,
       but the UNIQUE constraint on created_by_job_id makes this 1-to-1.
       The FK is intentional — it provides an audit chain and referential
       integrity for orphan detection.
```

### 11.2 Future Relationships (Phase 5+)

| Relationship | Type | Foreign Key | Notes |
|---|---|---|---|
| `wallets` → `deposits` | One-to-many | `deposits.wallet_id` | A wallet receives many deposits |
| `wallets` → `withdrawals` | One-to-many | `withdrawals.wallet_id` | A wallet initiates many withdrawals |
| `wallets` → `sweeps` | One-to-many | `sweeps.source_wallet_id` | A wallet is swept many times |
| `wallets` → `ledger_entries` | One-to-many | `ledger_entries.wallet_id` | Balance ledger |
| `wallets` → `networks` (via family) | Logical (no FK) | Resolved via `WalletFamilyResolver` | No direct FK — family maps to N networks |
| `wallets` → `tokens` (via family) | Logical (no FK) | Resolved by Token Module | Tokens supported per family |

### 11.3 What the Wallet Entity Does NOT Directly Reference

| Concern | Reason |
|---|---|
| `networks` table | A wallet is valid across ALL networks in its family; no per-network FK needed |
| `tokens` table | Token support is family-level, not wallet-level; resolved by Token Module |
| `customers` table | The backend has no `customers` table; `customerId` is an opaque string |

---

## 12. Future Extensions

| Feature | Required Schema Change | Notes |
|---|---|---|
| **HD Wallets** | Add `derivation_path VARCHAR(64)` and `hd_master_wallet_id UUID` columns | Derivation logic stays in Signer; backend stores the path only |
| **Multiple Addresses per Customer** | New `wallet_type` column; remove `(customer_id, driver_family)` UNIQUE; add separate ownership table | Enables multiple AVAILABLE wallets per family per customer |
| **Account Abstraction (ERC-4337)** | New `wallet_type = 'SMART_ACCOUNT'`; add `factory_address` and `implementation_address` columns | Smart wallet meta stored here; no private key involvement |
| **MPC Wallets** | New `wallet_type = 'MPC'`; add `mpc_group_id` and `key_share_count` columns | MPC coordination by Signer; backend stores group reference only |
| **Hardware Wallets (HSM)** | New `wallet_type = 'HSM'`; add `hsm_key_id` column | HSM reference ID only; private key in HSM |
| **Cold Wallets** | New `wallet_tier = 'COLD'` column | Separate pool config per tier; `COLD` wallets never auto-assigned |
| **Watch-only Wallets** | New `wallet_type = 'WATCH_ONLY'`; `created_by_job_id` becomes nullable | Imported addresses; no Signer job required |

All extensions follow the same immutability and pool rules. None allow
private keys on the backend. None store balances. None communicate with RPC.

---

## 13. Architecture Decision Records

### ADR-WM-D-001: Wallet Ownership Is Immutable

**Status**: Accepted

**Context**
Once a customer is given a blockchain address, that address is recorded
on-chain in all future deposits and withdrawals. If the backend were to
reassign the wallet to a different customer:
- Historical on-chain transactions would be attributed to the wrong customer.
- The original customer could still receive funds at that address indefinitely.
- Regulatory liability for misattributed funds would be unresolvable.

**Decision**
`customer_id` and `assigned_at` are set once and never overwritten.
`ASSIGNED` is a one-way terminal transition for ownership.
The `(customer_id, driver_family)` UNIQUE constraint enforces this at
the database layer. Reassignment is explicitly rejected at service layer
with `WalletAlreadyAssignedError`.

**Consequences**
- Wallets are never recycled between customers.
- A compromised wallet requires manual recovery (new wallet assignment).
- Pool consumption is monotonically increasing — new Signer-generated
  wallets are the only source of AVAILABLE inventory.

---

### ADR-WM-D-002: Reservation State Exists for Concurrency Safety

**Status**: Accepted

**Context**
Direct AVAILABLE → ASSIGNED in a two-step read-then-write pattern allows
a time-of-check/time-of-use (TOCTOU) race where two concurrent callers
both read the same AVAILABLE wallet and both attempt to assign it.
Application-level mutexes would not work in a multi-instance deployment.

**Decision**
Introduce `RESERVED` as an intermediate state. Reservation is performed
in a single atomic SQL `UPDATE ... WHERE ... FOR UPDATE SKIP LOCKED`.
This eliminates the TOCTOU window at the database level. The reservation
token provides per-caller ownership, and the TTL ensures wallets are
never permanently stuck in RESERVED if the caller crashes.

**Consequences**
- Pool count monitoring must exclude RESERVED wallets from AVAILABLE count.
- A reservation cleanup cron is required (runs every 10 seconds).
- Callers must handle `null` from `reserveWallet()` (pool empty).
- Reservation TTL must be longer than the longest expected assignment
  transaction (30 seconds is conservative).

---

### ADR-WM-D-003: Wallets Never Store Balances

**Status**: Accepted

**Context**
A wallet balance is not an intrinsic property of the wallet — it is a
property of the blockchain ledger at a specific block height. Storing
balances would require:
- Continuous blockchain synchronisation to maintain accuracy.
- Invalidation logic on every incoming and outgoing transaction.
- Race conditions between ledger updates and balance reads.
- Coupling the Wallet Module to the Blockchain Sync Module.

**Decision**
No `balance`, `available_balance`, or any balance-related column exists
on the `wallets` table. Balance queries are delegated to the Blockchain
Sync Module (Phase 5+) which maintains a separate, continuously updated ledger.

**Consequences**
- The Wallet Module is completely blockchain-agnostic.
- Withdrawal and Sweep modules must query the Sync Module for balances.
- The Wallet Module can be tested without any blockchain connectivity.

---

### ADR-WM-D-004: `customerId` Is Opaque — No Identity Coupling

**Status**: Accepted

**Context**
The current exchange passes Iranian National IDs as `customerId`. Naming
the column `national_id` or `iranian_id` would:
- Couple the backend to a specific country's identity scheme.
- Make the backend incompatible with foreign customers, corporate accounts,
  or future identity providers without a breaking migration.
- Potentially expose PII in column names in query logs and monitoring.

**Decision**
`customer_id VARCHAR(128)` — a single opaque string column. The Exchange
is responsible for mapping its internal identity to this token before
calling the Backend API. The Backend never interprets, parses, or
validates the format of `customerId` beyond non-null, non-empty.

**Consequences**
- Switching identity providers requires zero backend changes.
- Future multi-tenant support is straightforward.
- `customerId` must be treated as PII in logging and data handling.

---

### ADR-WM-D-005: Private Keys Never Exist on the Backend

**Status**: Accepted

**Context**
Private key material is the most sensitive data in a blockchain system.
Storing private keys on a network-accessible backend would:
- Make every backend security incident a key compromise incident.
- Require HSM infrastructure for every backend deployment.
- Create a single point of failure for all customer funds.
- Violate the air-gap security model.

**Decision**
The `wallets` table stores only:
- `address` — derivable from the public key; not sensitive.
- `public_key` — the full public key; not sensitive (derivable from any transaction).
- `public_key_fingerprint` — a compact audit reference; not sensitive.

Private keys, mnemonics, seeds, and derivation paths used to derive
private keys are exclusively owned by the Offline Signer. They are never
transmitted to, stored on, or processed by the backend under any circumstance.

**Consequences**
- A full backend compromise exposes zero private keys.
- The Offline Signer is the single cryptographic authority.
- Key recovery from the backend side is impossible — the Signer is the
  only backup system.

---

### ADR-WM-D-006: Wallet Pool Exists for Sub-Second Assignment

**Status**: Accepted

**Context**
Customer onboarding requires wallet assignment as part of a synchronous
API response. If wallets were generated on-demand:
- The backend would wait for a SignerJob to complete (up to 60 seconds).
- The Exchange API response would time out.
- Customer experience would be unacceptable.

**Decision**
Maintain a pre-generated pool of AVAILABLE wallets per family. Assignment
is a single database write operation. Pool replenishment is asynchronous,
driven by the WalletPoolCheckTask cron. The pool always stays above the
configured threshold.

**Consequences**
- Assignment latency: < 50ms (single DB write).
- Pool exhaustion is a critical incident requiring operator response.
- Pool size must be provisioned for peak onboarding demand.
- `WalletPoolLow` events must trigger production alerts.

---

### ADR-WM-D-007: `publicKey` Is Required (Not Optional)

**Status**: Accepted

**Context**
An earlier version of the entity schema made `public_key` optional
(nullable). This was reconsidered because:
- A wallet without a public key has an incomplete audit chain.
- Address derivation verification (future) requires the public key.
- MPC and multi-sig wallet types (future) require the public key for quorum setup.
- The Signer always returns the public key in the CREATE_WALLET result.

**Decision**
`public_key` is `NOT NULL`. A CREATE_WALLET result without a public key
is rejected by `WalletCreationResultHandler` before persisting the wallet.
`public_key_fingerprint` and `signer_version` remain nullable because
they are audit metadata, not functional requirements.

**Consequences**
- Every wallet has a provable link to its public key.
- Legacy wallet import (watch-only) may provide a placeholder or set
  `public_key` to a known-empty sentinel (extension point §12).
- The Signer protocol must always include `publicKey` in its result payload.
