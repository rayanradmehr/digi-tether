# Network Module

> **Phase 2 — Structural Foundation**

The Network Module is the **dependency root** of the entire blockchain backend.
It is the single authoritative registry of all supported blockchain networks.

---

## Purpose

Provide a persistent, operator-managed catalogue of blockchain networks.
Every other business module queries this module before performing any
chain-aware operation. Network itself has **zero imports from any other
business module**.

---

## Responsibilities

| Responsibility | Owned here? |
|---|---|
| CRUD for network records | ✅ |
| Activation gate (`isActive`) | ✅ |
| Driver key resolution (string only) | ✅ |
| Required confirmation count | ✅ |
| Block explorer URL construction | ✅ |
| Soft-delete (audit trail) | ✅ |
| RPC endpoint storage | ❌ (env vars) |
| Driver instantiation | ❌ (Drivers layer) |
| Token / Wallet / Deposit / Withdrawal logic | ❌ (respective modules) |
| Queue publishing / consuming | ❌ (Phase 3+) |
| Private key material | ❌ (Signer only) |
| Blockchain SDK imports | ❌ (never) |

---

## Module Boundaries

### Hard boundaries — must never be crossed
- No import from Token, Wallet, Deposit, Withdrawal, Sweep, Broadcast, or Signer
- No RPC call, HTTP node request, or WebSocket subscription
- No driver class instantiation or driver interface reference
- No blockchain SDK (ethers.js, web3.js, TronWeb, etc.)
- No RabbitMQ publisher or consumer in Phase 2

### Soft boundaries — extension points for future phases
- `network.activated` / `network.deactivated` in-process events (Phase 3+)
- Multi-RPC support per network (Driver concern, not Network concern)
- Admin audit log for every mutation (Phase 4+)

---

## Internal Structure

```
network/
├── controllers/
│   └── network.controller.ts     Thin HTTP layer — delegates to NetworkService
├── dto/
│   ├── create-network.dto.ts     Input validation for creation
│   ├── update-network.dto.ts     Partial update (slug + chainId excluded)
│   ├── network-response.dto.ts   Swagger output shape
│   ├── network-query.dto.ts      Paginated list filters
│   └── index.ts
├── entities/
│   └── network.entity.ts         TypeORM entity → `networks` table
├── enums/
│   └── network-driver.enum.ts    NetworkDriver enum (EVM, TRON, …)
├── repositories/
│   └── network.repository.ts     SQL queries only — no business logic
├── services/
│   └── network.service.ts        Single business layer
├── tests/
│   ├── network.service.spec.ts   Unit tests (no DB)
│   └── network.repository.spec.ts
├── network.module.ts
└── README.md
```

---

## Dependencies

### Inbound (who depends on Network)
- **TokenModule** — token belongs to a network
- **WalletModule** — wallet generated for a network
- **DepositModule** — scanner scoped to a network, reads `requiredConfirmations`
- **WithdrawalModule** — validates network active before submission
- **SweepModule** — reads `driverKey` for sweep execution
- **BroadcastModule** — reads `driverKey` to select broadcaster
- **SignerModule** — reads network metadata for curve/algorithm selection

### Outbound (what Network depends on)
- `SharedModule` → `ILogger` (logging), `ICache` (read-through cache)
- `DatabaseModule` → TypeORM `DataSource` (persistence)
- `@common` → `PaginationQueryDto`, utilities
- `@core` → `AppException` hierarchy

---

## Exported Components

Only **`NetworkService`** is exported. All other providers are internal.

```ts
import { NetworkModule } from '@modules/network/network.module';
```

### `NetworkService` public API

| Method | Returns | Description |
|--------|---------|-------------|
| `findAll(query)` | `PaginatedResult<NetworkResponseDto>` | Paginated list with optional filters |
| `findById(id)` | `NetworkResponseDto` | By UUID; throws `NotFoundException` if absent |
| `findBySlug(slug)` | `NetworkResponseDto` | By slug; throws `NotFoundException` if absent |
| `isActive(id)` | `boolean` | Activation gate check |
| `getDriverKey(id)` | `NetworkDriver` | Driver key for active networks |
| `getConfirmations(id)` | `number` | Required confirmation count |
| `getExplorerUrl(id, hash)` | `string` | Formatted explorer URL |
| `create(dto)` | `NetworkResponseDto` | Register new network |
| `update(id, dto)` | `NetworkResponseDto` | Update mutable fields |
| `activate(id)` | `NetworkResponseDto` | Set `isActive = true` |
| `deactivate(id)` | `NetworkResponseDto` | Set `isActive = false` (no cascade) |
| `remove(id)` | `void` | Soft-delete only |

---

## Entity: `Network` → table `networks`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, generated | Never expose as sequential int |
| `name` | VARCHAR(100) | UNIQUE, NOT NULL | Display name |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | **Immutable** after creation |
| `symbol` | VARCHAR(20) | NOT NULL | Native ticker (ETH, TRX) |
| `chain_id` | VARCHAR(100) | UNIQUE, NOT NULL | **Immutable** after creation |
| `native_decimals` | SMALLINT | NOT NULL | Range 0–36 |
| `driver_key` | ENUM | NOT NULL | `NetworkDriver` enum value |
| `explorer_base_url` | VARCHAR(255) | NOT NULL | HTTPS URL |
| `required_confirmations` | SMALLINT | NOT NULL, default 12 | Read by Deposit Scanner |
| `block_time_seconds` | SMALLINT | NOT NULL, default 12 | Informational only |
| `is_testnet` | BOOLEAN | NOT NULL, default false | |
| `is_active` | BOOLEAN | NOT NULL, default true | Activation gate |
| `description` | TEXT | NULLABLE | Operator notes |
| `version` | INT | NOT NULL | Optimistic lock counter |
| `created_at` | TIMESTAMPTZ | NOT NULL | Auto-set |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Auto-updated |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft-delete; NULL = active |

### What is NOT stored
- RPC endpoint URLs → environment variables
- WebSocket endpoints → environment variables
- Private keys → Signer module only
- Fee policies → Withdrawal / Sweep modules
- Token lists → Token Module

---

## Enum: `NetworkDriver`

| Value | String | Chains |
|-------|--------|--------|
| `NetworkDriver.EVM` | `'evm'` | Ethereum, BSC, Polygon, Avalanche C-Chain, … |
| `NetworkDriver.TRON` | `'tron'` | Tron mainnet and testnets |

Adding a new driver family = add one enum member. No entity migration needed.

---

## Future Extension Points

- **`network.activated` / `network.deactivated` events** via `IEventPublisher` (Phase 3)
- **Network health monitoring** — background RPC ping, `rpcHealthy` flag (Phase 4+)
- **Admin audit log** — `actorId`, `action`, `before`, `after` per mutation (Phase 4+)
- **Multi-driver support** — `driverKeys: NetworkDriver[]` for chains with multiple drivers
- **Network-level fee config** — EIP-1559 vs legacy gas strategy embedded value object

---

## Architecture Rules

1. Network never communicates with any blockchain node or RPC endpoint
2. Network never instantiates or imports from the Drivers layer
3. Network never imports from Token, Wallet, Deposit, Withdrawal, Sweep, Broadcast, or Signer
4. Records are **soft-deleted only** — hard deletion is permanently forbidden
5. `NetworkService` is the **only exported provider**
6. `NetworkController` contains zero business logic
7. `NetworkRepository` contains zero business logic
8. `slug` and `chainId` are **immutable** after creation
9. RPC URLs are **never stored** in the database
10. `driverKey` is an enum value — never a relational foreign key
