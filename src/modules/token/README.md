# Token Module

> **Phase 3** of the Digi-Tether platform — implemented and reviewed in **Step 5 / Step 6**.

Manages the catalogue of blockchain assets (native coins and smart-contract tokens) supported by the platform. It is the second tier in the domain dependency chain:

```
SharedModule → NetworkModule → TokenModule → WalletModule → …
```

---

## Module Purpose

Provides a persistent, auditable, lifecycle-managed registry of blockchain assets. Downstream modules (Wallet, Deposit, Withdrawal, Sweep, Signer) query the Token Module to resolve decimals, confirm counts, contract addresses, and active status — never touching the `tokens` table directly.

---

## Responsibilities

| Concern | Owner |
|---|---|
| Persisting token records | `TokenRepository` |
| All business rules and validation | `TokenService` |
| HTTP binding + Swagger documentation | `TokenController` |
| Entity → DTO projection | `TokenMapper` |
| Cross-field DTO validation | `ContractAddressRequiredConstraint` |

---

## Dependencies

| Dependency | Reason |
|---|---|
| `NetworkModule` | Network existence, activity, driver key, confirmation count, explorer URL |
| `SharedModule` (`ICache`) | Cache-aside for `findById` |
| `SharedModule` (`ILogger`) | Structured mutation logging |
| `SharedModule` (`IEventPublisher`) | Domain event publishing |
| `TypeOrmModule.forFeature([Token])` | PostgreSQL access via TypeORM |

This module **never** imports Wallet, Deposit, Withdrawal, Sweep, Broadcast, or Signer.

---

## Public API

Only `TokenService` is exported. Downstream modules import `TokenModule` and inject `TokenService`.

### Exported Methods

```ts
// Queries
findAll(query: TokenQueryDto): Promise<PaginatedResult<TokenResponseDto>>
findById(id: string): Promise<TokenResponseDto>                          // cache-aside
findByNetworkId(networkId, query): Promise<PaginatedResult<TokenResponseDto>>
findActiveByNetworkId(networkId): Promise<TokenResponseDto[]>            // no cache
isActive(id: string): Promise<boolean>                                   // never throws
getDecimals(id: string): Promise<number>
getConfirmations(id: string): Promise<number>                            // override || network default
getExplorerUrl(id: string): Promise<string>

// Mutations
create(dto: CreateTokenDto): Promise<TokenResponseDto>
update(id, dto: UpdateTokenDto): Promise<TokenResponseDto>
enable(id: string): Promise<TokenResponseDto>                            // ACTIVE  (idempotent)
disable(id: string): Promise<TokenResponseDto>                           // INACTIVE (idempotent)
deprecate(id: string): Promise<TokenResponseDto>                         // DEPRECATED (terminal)
remove(id: string): Promise<void>                                        // soft-delete only
```

### HTTP Routes

| Method | Path | Handler | Status Codes |
|---|---|---|---|
| `POST` | `/tokens` | `create` | 201, 400, 409 |
| `GET` | `/tokens` | `findAll` | 200, 400 |
| `GET` | `/tokens/network/:networkId` | `findByNetworkId` | 200, 400 |
| `GET` | `/tokens/:id` | `findById` | 200, 400, 404 |
| `PATCH` | `/tokens/:id` | `update` | 200, 400, 404, 409 |
| `PATCH` | `/tokens/:id/enable` | `enable` | 200, 400, 404, 409 |
| `PATCH` | `/tokens/:id/disable` | `disable` | 200, 400, 404, 409 |
| `PATCH` | `/tokens/:id/deprecate` | `deprecate` | 200, 400, 404, 409 |
| `DELETE` | `/tokens/:id` | `remove` | 204, 400, 404 |

---

## Folder Structure

```
src/modules/token/
├── __tests__/
│   ├── token-service.spec.ts
│   ├── token-repository.spec.ts
│   └── token-controller.spec.ts
├── constants/
│   └── token-cache.constants.ts    # cache key builder + TTL
├── controllers/
│   └── token.controller.ts         # thin HTTP layer
├── dto/
│   ├── create-token.dto.ts
│   ├── update-token.dto.ts
│   ├── token-response.dto.ts
│   └── token-query.dto.ts
├── entities/
│   └── token.entity.ts             # TypeORM entity
├── enums/
│   ├── token-type.enum.ts
│   ├── token-status.enum.ts
│   └── token-standard.enum.ts
├── events/
│   ├── token-created.event.ts
│   └── token-status-changed.event.ts
├── mappers/
│   └── token.mapper.ts             # Token → TokenResponseDto
├── repositories/
│   └── token.repository.ts         # pure persistence
├── services/
│   └── token.service.ts            # all business logic
├── validators/
│   └── contract-address-required.validator.ts
└── token.module.ts
```

---

## Data Flow

```
HTTP Request
    ↓
[ValidationPipe]  ←─ class-validator + ContractAddressRequiredConstraint
    ↓
TokenController   ←─ zero logic; one service call per handler
    ↓
TokenService      ←─ all business rules, cache, events, logging
    ↓           └── NetworkService (network gate)
    ↓
TokenRepository   ←─ pure TypeORM; no logic
    ↓
PostgreSQL (tokens table)
    ↓
Token entity  →  TokenMapper  →  TokenResponseDto
    ↓
[ResponseInterceptor]  { success, data, message }
    ↓
HTTP Response
```

---

## Entity Description

### `Token` (table: `tokens`)

| Column | Type | Mutable | Notes |
|---|---|---|---|
| `id` | `uuid` | No | PK, auto-generated |
| `network_id` | `uuid` | No | FK → `networks.id`, ON DELETE RESTRICT |
| `type` | `enum(TokenType)` | No | `native` or `contract` |
| `standard` | `enum(TokenStandard)` | No | `native`, `erc20`, `trc20` |
| `name` | `varchar(100)` | Yes | Display name |
| `symbol` | `varchar(20)` | Yes | Uppercase alphanumeric; unique per network |
| `decimals` | `smallint` | No | Range 0–36 |
| `contract_address` | `varchar(100)` | No | NULL for native; required for contract |
| `status` | `enum(TokenStatus)` | Yes | `active`, `inactive`, `deprecated` |
| `confirmations_override` | `smallint` | Yes | NULL = use network default |
| `logo_url` | `varchar(512)` | Yes | HTTPS URL or NULL |
| `description` | `text` | Yes | Informational; no logic |
| `version` | `int` | Auto | Optimistic lock; never exposed in API |
| `created_at` | `timestamptz` | Auto | Set once |
| `updated_at` | `timestamptz` | Auto | Updated on every save |
| `deleted_at` | `timestamptz` | Auto | NULL = live; set by `softRemove()` |

### Indexes

- `idx_tokens_network_id` on `network_id`
- `idx_tokens_status` on `status`
- `idx_tokens_type` on `type`
- `idx_tokens_standard` on `standard`

---

## DTO Description

### `CreateTokenDto`

Required: `networkId`, `type`, `standard`, `name`, `symbol`, `decimals`.
Optional: `contractAddress` (required by cross-field constraint for contract tokens), `status`, `confirmationsOverride`, `logoUrl`, `description`.

### `UpdateTokenDto`

All fields optional. **Immutable fields are absent**: `networkId`, `type`, `standard`, `contractAddress`, `decimals`.

### `TokenResponseDto`

Public projection. Excludes `deletedAt` and `version`.

### `TokenQueryDto`

Pagination + optional filters: `page`, `limit`, `networkId`, `type`, `standard`, `status`.

---

## Validation Rules

| Field | Rule |
|---|---|
| `networkId` | UUID v4 |
| `type` | `TokenType` enum member |
| `standard` | `TokenStandard` enum member; must match network driver (service-level) |
| `symbol` | `/^[A-Z0-9]{1,20}$/`; unique per network |
| `decimals` | Integer 0–36 |
| `contractAddress` | NULL for native; EVM 0x-prefixed 40 hex / Tron Base58Check / Tron hex for contract; zero address forbidden |
| `status` | `TokenStatus` enum; DEPRECATED is terminal (service-level) |
| `confirmationsOverride` | Integer 1–500 or null |
| `logoUrl` | HTTPS URL or null |

### Cross-field (ContractAddressRequiredConstraint)

- `type = native` → `contractAddress` must be `null`. Empty string and zero addresses rejected.
- `type = contract` → `contractAddress` must be non-null, non-empty, valid EVM or Tron address.

---

## Events

| Event type | Published when | Payload |
|---|---|---|
| `token.created` | New token persisted | `tokenId`, `networkId`, `symbol`, `type`, `standard`, `contractAddress` |
| `token.status.changed` | Status transition detected | `tokenId`, `networkId`, `symbol`, `previousStatus`, `newStatus` |

Events are published in-process via `IEventPublisher`. No event consumers are wired within this module.

---

## Caching

- **Strategy**: cache-aside via `ICache.wrap()`.
- **Scope**: individual token lookups by UUID (`findById`).
- **Key pattern**: `token:id:<uuid>`
- **TTL**: `TTL.MEDIUM × 1000` ms (5 minutes, matching Network Module).
- **Invalidation**: `cache.del()` called after every mutation (`update`, `softDelete`).
- List queries (`findAll`, `findByNetworkId`) are **not cached** — pagination keys are too varied.

---

## Extension Points

1. **New chain family** — Add a member to `TokenStandard` and `NetworkDriver`, then extend `ALLOWED_STANDARDS_BY_DRIVER` in `TokenService`. No entity migration required.
2. **New query filter** — Add an optional field to `TokenQueryDto` and one `if` branch in `TokenRepository.findAll`.
3. **New events** — Add a new event file under `events/`, call `eventPublisher.publish()` in the relevant service method. No existing code changes.
4. **Soft-delete recovery** — Not currently exposed. Would require a new repository method using `withDeleted: true` and a new service + controller endpoint.

---

## Architectural Decisions

| ADR | Decision |
|---|---|
| ADR-T-001 | `contractAddress` is immutable after creation (Invariant 9) |
| ADR-T-002 | `decimals` is immutable after creation (Invariant 8) |
| ADR-T-003 | One native token per network, enforced at service level (Invariant 1) |
| ADR-T-004 | `(networkId, symbol)` uniqueness enforced at service level (Invariant 5) |
| ADR-T-005 | `DEPRECATED` is a terminal state; transitions from it are forbidden |
| ADR-T-006 | Immutable fields are absent from `UpdateTokenDto` (structural guard) |
| ADR-T-007 | Token standard must be compatible with network driver (Invariant 7) |
| ADR-T-008 | Explorer URL construction delegated to `NetworkService.getExplorerUrl` |
| ADR-T-009 | Confirmation count: token override → network default (Invariant 15) |
| ADR-T-010 | Hard deletion is permanently forbidden (Invariant 12) |
