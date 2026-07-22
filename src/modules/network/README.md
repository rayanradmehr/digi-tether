# Network Module

The **dependency root** of the blockchain backend. Every other business module
depends on Network; Network depends on no other business module.

## Purpose

Provides a single, authoritative registry of all supported blockchain networks.
Acts as the configuration layer that downstream modules query before performing
any on-chain operation.

## Responsibilities

- CRUD operations for network records
- Activation gate (`isActive` flag)
- Driver key resolution (string key → Drivers layer resolves to a class)
- Confirmation count for Deposit Scanner
- Block explorer URL construction
- Soft-delete only (hard deletion is permanently forbidden)

## What This Module Does NOT Do

- Connect to any blockchain node
- Instantiate or import any driver
- Process transactions
- Handle tokens, wallets, deposits, withdrawals, sweeps
- Publish or consume queue messages (Phase 2)
- Store RPC endpoints (those are environment variables)

## Public API

Only `NetworkService` is exported. Downstream modules inject it via:

```ts
import { NetworkModule } from '@modules/network/network.module';
// then inject NetworkService in the dependent module's providers
```

## Exported Service Methods

| Method | Description |
|--------|-------------|
| `findAll(query)` | Paginated network list with optional filters |
| `findById(id)` | Single network by UUID, throws if absent |
| `findBySlug(slug)` | Single network by slug, throws if absent |
| `isActive(id)` | Boolean activation check |
| `getDriverKey(id)` | Driver key string for active networks |
| `getConfirmations(id)` | Required confirmation count |
| `getExplorerUrl(id, hash)` | Formatted block explorer URL |
| `create(dto)` | Register a new network |
| `update(id, dto)` | Update mutable fields |
| `activate(id)` | Set `isActive = true` |
| `deactivate(id)` | Set `isActive = false` (no cascade) |
| `remove(id)` | Soft-delete (no hard deletion ever) |

## Architecture Rules (see ADR in Phase 2 architecture doc)

1. Network never communicates with blockchain nodes
2. Network never instantiates drivers
3. Network never imports from Token, Wallet, Deposit, Withdrawal, Sweep, Broadcast, or Signer
4. Network records are soft-deleted only
5. `NetworkService` is the single exported provider
6. Controllers contain zero business logic
7. Repository contains zero business logic
8. `slug` and `chainId` are immutable after creation
9. RPC URLs are never stored in the database

## Internal Structure

```
network/
  controllers/   — thin HTTP layer
  dto/           — input validation + Swagger output shapes
  entities/      — Network TypeORM entity
  repositories/  — typed query methods only
  services/      — single business layer
  tests/         — unit tests (no DB, no RPC)
  README.md
```
