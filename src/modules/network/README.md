# Network Module

> **Phase 2 — Complete** | Status: Production-ready

The Network Module is the **dependency root** of the entire digi-tether platform.
Every chain-aware feature (Token, Wallet, Deposit, Withdrawal, Sweep, Broadcast)
carries a foreign key to the `networks` table and calls `NetworkService` to
validate operations before touching the blockchain.

---

## Purpose

Store and manage the **static metadata** of every supported blockchain network.
This module answers the question: _"What do we know about this chain at the
application level?"_ — not _"What is the current state of this chain?"_

Examples of questions this module answers:
- Is this network active and usable?
- What driver family handles this network?
- How many confirmations are required before crediting a deposit?
- What is the block explorer base URL?

---

## Responsibilities

| Concern | Owner | Notes |
|---------|-------|-------|
| Network metadata CRUD | `NetworkService` | Create, read, update, soft-delete |
| Uniqueness enforcement | `NetworkService` | Slug + chainId globally unique |
| Activation gate | `NetworkService` | `isActive` flag |
| Persistence | `NetworkRepository` | TypeORM wrapper, no business logic |
| HTTP API | `NetworkController` | Thin layer, delegates to service |
| Cache invalidation | `NetworkService` | Via `ICache`, never manual |

**This module does NOT:**
- Communicate with blockchain nodes or RPC endpoints
- Instantiate or reference blockchain drivers
- Store private keys, secrets, or RPC URLs
- Perform wallet, deposit, withdrawal, or token logic

---

## Architecture

```
HTTP Request
    │
    ▼
NetworkController          (HTTP layer — zero business logic)
    │  delegates 100%
    ▼
NetworkService             (business layer — all rules live here)
    │  reads/writes via
    ▼
NetworkRepository          (persistence layer — TypeORM wrapper only)
    │  wraps
    ▼
TypeORM Repository<Network>
    │
    ▼
PostgreSQL — networks table
```

**Cross-cutting concerns injected into `NetworkService`:**
- `ICache` (via `INJECTION_TOKENS.CACHE`) — cache-aside reads, invalidation after mutations
- `ILogger` (via `INJECTION_TOKENS.LOGGER`) — structured logging for every mutation

---

## Module Boundaries

### What is exported

```ts
exports: [NetworkService]
```

Only `NetworkService` is exported. Downstream modules import `NetworkModule`
and inject `NetworkService`. They must **never** access `NetworkRepository`
or issue queries against the `networks` table directly.

### What is intentionally not exported
- `NetworkRepository` — persistence is an internal implementation detail
- `NetworkController` — HTTP routing is not consumed by other modules
- `NetworkModule` itself — imported by `AppModule`, not re-exported

---

## Dependencies

| Dependency | Type | Reason |
|------------|------|--------|
| `TypeOrmModule.forFeature([Network])` | Framework | Registers the `networks` table entity |
| `SharedModule` (via `AppModule`) | Infrastructure | Provides `ICache` and `ILogger` tokens |
| `@core/exceptions/*` | Domain | `NotFoundException`, `ConflictException` |
| `@common/pagination/*` | Utility | `PaginationQueryDto`, `PaginatedResult`, `paginate()`, `buildPaginatedResult()` |
| `@common/constants/cache.constants` | Utility | `CACHE_PREFIX.NETWORK`, `buildCacheKey()` |
| `@common/constants/ttl.constants` | Utility | `TTL.MEDIUM` (5 min cache TTL) |
| `class-validator` / `class-transformer` | Validation | DTO validation and transformation |
| `@nestjs/swagger` | Documentation | Swagger decorators on all DTOs and endpoints |

---

## Folder Structure

```
src/modules/network/
├── README.md                          ← this file
├── network.module.ts                  ← NestJS module definition
│
├── entities/
│   └── network.entity.ts             ← TypeORM entity (networks table)
│
├── enums/
│   ├── network-driver.enum.ts        ← NetworkDriver enum (EVM, TRON, …)
│   └── index.ts
│
├── dto/
│   ├── create-network.dto.ts         ← POST /networks input
│   ├── update-network.dto.ts         ← PATCH /networks/:id input (no immutable fields)
│   ├── network-response.dto.ts       ← outbound shape (no deletedAt, no version)
│   ├── network-query.dto.ts          ← GET /networks query params + filters
│   └── index.ts
│
├── repositories/
│   └── network.repository.ts         ← pure persistence layer
│
├── services/
│   └── network.service.ts            ← all business logic
│
├── controllers/
│   └── network.controller.ts         ← HTTP entry points
│
└── tests/
    ├── network.service.spec.ts       ← 100% service coverage
    ├── network.repository.spec.ts    ← full repository coverage
    └── network.controller.spec.ts    ← full controller coverage
```

---

## Public API (`NetworkService`)

Downstream modules depend only on these methods.

| Method | Signature | Description |
|--------|-----------|-------------|
| `findAll` | `(query: NetworkQueryDto) → PaginatedResult<NetworkResponseDto>` | Paginated list with optional filters |
| `findById` | `(id: string) → NetworkResponseDto` | Single network by UUID; cache-aside |
| `findBySlug` | `(slug: string) → NetworkResponseDto` | Single network by slug; cache-aside |
| `findActive` | `() → NetworkResponseDto[]` | All active networks; no pagination |
| `isActive` | `(id: string) → boolean` | Gate check — never throws |
| `getDriverKey` | `(id: string) → NetworkDriver` | Driver enum for an active network |
| `getRequiredConfirmations` | `(id: string) → number` | Confirmation count for deposit finality |
| `getExplorerUrl` | `(id: string, hashOrAddress: string) → string` | Explorer link builder |
| `create` | `(dto: CreateNetworkDto) → NetworkResponseDto` | Register a new network |
| `update` | `(id: string, dto: UpdateNetworkDto) → NetworkResponseDto` | Partial update of mutable fields |
| `activate` | `(id: string) → NetworkResponseDto` | Set `isActive = true` |
| `deactivate` | `(id: string) → NetworkResponseDto` | Set `isActive = false` |
| `remove` | `(id: string) → void` | Soft-delete (sets `deleted_at`) |

---

## HTTP Endpoints

Base path: `/networks` (global `v1` prefix prepended by `main.ts`)

| Method | Path | Handler | Success | Body/Query |
|--------|------|---------|---------|------------|
| `POST` | `/networks` | `create` | 201 | `CreateNetworkDto` |
| `GET` | `/networks` | `findAll` | 200 | `NetworkQueryDto` (query params) |
| `GET` | `/networks/slug/:slug` | `findBySlug` | 200 | — |
| `GET` | `/networks/:id` | `findById` | 200 | — |
| `PATCH` | `/networks/:id` | `update` | 200 | `UpdateNetworkDto` |
| `PATCH` | `/networks/:id/activate` | `activate` | 200 | — |
| `PATCH` | `/networks/:id/deactivate` | `deactivate` | 200 | — |
| `DELETE` | `/networks/:id` | `remove` | 204 | — |

> `GET /networks/slug/:slug` is declared **before** `GET /networks/:id` in the
> controller to ensure NestJS route matching resolves the static `slug/` prefix
> before treating the path segment as a UUID wildcard.

---

## Data Model

### `networks` table

| Column | Type | Nullable | Unique | Notes |
|--------|------|----------|--------|-------|
| `id` | `uuid` | No | Yes (PK) | UUID v4, generated by DB |
| `name` | `varchar(100)` | No | Yes | Human-readable display name |
| `slug` | `varchar(100)` | No | Yes | URL-safe; **immutable** |
| `symbol` | `varchar(20)` | No | No | Native currency ticker (ETH, TRX) |
| `chain_id` | `varchar(100)` | No | Yes | EIP-155 int string or canonical name; **immutable** |
| `native_decimals` | `smallint` | No | No | Range 0–36 |
| `driver_key` | `enum` | No | No | `NetworkDriver` enum value |
| `explorer_base_url` | `varchar(255)` | No | No | HTTPS URL |
| `required_confirmations` | `smallint` | No | No | Default 12 |
| `block_time_seconds` | `smallint` | No | No | Default 12 (informational only) |
| `is_testnet` | `boolean` | No | No | Default false |
| `is_active` | `boolean` | No | No | Default true |
| `description` | `text` | Yes | No | Operator note |
| `version` | `int` | No | No | Optimistic lock counter |
| `created_at` | `timestamptz` | No | No | Set once |
| `updated_at` | `timestamptz` | No | No | Auto-updated |
| `deleted_at` | `timestamptz` | Yes | No | Soft-delete timestamp |

### `NetworkDriver` enum

| Value | Description |
|-------|-------------|
| `evm` | EVM-compatible chains (Ethereum, BSC, Polygon, Avalanche C-Chain, …) |
| `tron` | Tron mainnet and testnets (Nile, Shasta) |

Adding a new driver: add an enum member + a single Postgres `ALTER TYPE` migration. No entity structure changes required.

---

## Business Rules

1. **Slug is immutable.** Once set at creation, `slug` cannot be changed. A database migration and an ADR are required to rename a slug.
2. **ChainId is immutable.** Same policy as slug. Prevents catastrophic mis-routing of on-chain operations.
3. **Slug is globally unique** among non-deleted networks. The service enforces this with `existsBySlug()` before insert.
4. **ChainId is globally unique** among non-deleted networks. Same mechanism.
5. **No hard deletion.** `softDelete()` sets `deleted_at`. The row is retained permanently for audit and referential integrity.
6. **Activation is not a cascade.** Deactivating a network does not automatically block downstream Wallets, Tokens, or in-flight operations. Each downstream module checks `networkService.isActive()` independently.
7. **Cache-aside for single-record reads.** `findById` and `findBySlug` use `ICache.wrap()` with a 5-minute TTL. List queries are never cached.
8. **Cache invalidation after every mutation.** Both the UUID key and the slug key are deleted in parallel after `update`, `activate`, `deactivate`, and `remove`.
9. **No blockchain logic here.** The Network Module only stores metadata. It never opens connections to nodes, constructs transactions, or handles cryptographic material.
10. **No RPC URLs stored.** RPC endpoints are infrastructure config (environment variables / secrets manager), not application metadata.

---

## Architecture Rules (Non-Negotiable)

- `NetworkController` → `NetworkService` only. Controller never touches the repository.
- `NetworkService` → `NetworkRepository` only. Service never uses TypeORM directly.
- `NetworkRepository` → TypeORM `Repository<Network>` only. Repository never calls a service or another repository.
- `NetworkRepository` never uses `QueryBuilder`.
- `NetworkService` never implements cache logic manually — always via `ICache`.
- Only `NetworkService` is exported from the module.
- No downstream module (Token, Wallet, Deposit, …) ever imports `NetworkRepository`.
- No blockchain SDK, no RPC client, no private key material, ever enters this module.

---

## Usage Examples

### Register a new EVM network

```bash
curl -X POST /v1/networks \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Ethereum",
    "slug": "ethereum-mainnet",
    "symbol": "ETH",
    "chainId": "1",
    "nativeDecimals": 18,
    "driverKey": "evm",
    "explorerBaseUrl": "https://etherscan.io",
    "requiredConfirmations": 12
  }'
```

### List active EVM networks (page 1, 10 per page)

```bash
curl '/v1/networks?isActive=true&driverKey=evm&page=1&limit=10'
```

### Deactivate a network

```bash
curl -X PATCH /v1/networks/aaaaaaaa-0000-0000-0000-000000000001/deactivate
```

### Consume `NetworkService` in a downstream module

```ts
// token.module.ts
@Module({ imports: [NetworkModule] })
export class TokenModule {}

// token.service.ts
@Injectable()
export class TokenService {
  constructor(private readonly networkService: NetworkService) {}

  async validateNetwork(networkId: string): Promise<void> {
    if (!(await this.networkService.isActive(networkId))) {
      throw new ConflictException(`Network ${networkId} is inactive`);
    }
  }

  async getDriver(networkId: string): Promise<NetworkDriver> {
    return this.networkService.getDriverKey(networkId);
  }
}
```

---

## Future Extensions

| Extension | Notes |
|-----------|-------|
| Additional driver families | Add enum member + migration; zero entity changes |
| Network-level fee configuration | New nullable columns; no structural impact |
| Network health status | Real-time flag driven by the Monitor module (Phase 4+) |
| Event publishing on state changes | `IEventPublisher` already available; subscribe in Phase 3+ |
| Admin role guard on mutations | Add `@UseGuards(RolesGuard)` in Step 4 controller; no service changes |

---

## Limitations

- **No real-time state.** The module stores static metadata only. Block height, network latency, and node health are not tracked here.
- **No RPC configuration.** RPC endpoints are environment variables; they are never stored in the database.
- **No event publishing yet.** Domain events (NetworkCreated, NetworkDeactivated) will be added in Phase 3 when the Event Bus is wired.
- **No authentication guard yet.** Mutation endpoints are unguarded until the Auth Module (Phase 3) provides `JwtAuthGuard`.
