import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Network } from '../entities/network.entity';
import { NetworkDriver } from '../enums/network-driver.enum';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type { NetworkQueryDto } from '../dto/network-query.dto';

/**
 * Pure persistence layer for the `networks` table.
 *
 * Responsibilities
 * ----------------
 * - Wrap every TypeORM operation behind a typed method.
 * - Translate DTOs / primitives into TypeORM `FindOptions`.
 * - Apply pagination and filtering at the query level.
 * - Never contain business rules, validation, or conditional logic beyond
 *   translating caller arguments to WHERE clauses.
 *
 * Rules (enforced by architecture review)
 * ----------------------------------------
 * - Must never call another repository.
 * - Must never call a service.
 * - Must never use QueryBuilder (all queries via `find` / `findAndCount`).
 * - Must never throw domain exceptions (returns `null` on miss).
 * - Must never expose the raw TypeORM `Repository<Network>` to callers.
 */
@Injectable()
export class NetworkRepository {
  public constructor(
    @InjectRepository(Network)
    private readonly repo: Repository<Network>,
  ) {}

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /**
   * Finds a network record by its UUID primary key.
   *
   * Returns `null` when:
   * - The UUID does not exist.
   * - The record has been soft-deleted (`deleted_at IS NOT NULL`).
   *
   * TypeORM automatically appends `WHERE deleted_at IS NULL` for
   * entities decorated with `@DeleteDateColumn`.
   */
  public async findById(id: string): Promise<Network | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Finds a network by its URL-safe slug.
   *
   * Returns `null` when the slug is not found or the record is soft-deleted.
   * Used by the service for slug-based lookups and duplicate detection.
   */
  public async findBySlug(slug: string): Promise<Network | null> {
    return this.repo.findOne({ where: { slug } });
  }

  /**
   * Finds a network by its chain-level identifier.
   *
   * Returns `null` when not found or soft-deleted.
   * Used by the service to prevent duplicate `chainId` registrations.
   */
  public async findByChainId(chainId: string): Promise<Network | null> {
    return this.repo.findOne({ where: { chainId } });
  }

  /**
   * Returns a paginated, optionally filtered list of non-deleted networks.
   *
   * Applied filters (all optional, combined with AND):
   * - `driverKey`  — match exact `NetworkDriver` enum value.
   * - `isActive`   — boolean equality filter.
   * - `isTestnet`  — boolean equality filter.
   *
   * Results are ordered by `created_at DESC` (newest first).
   * Pagination uses the shared `paginate()` utility to compute `skip`/`take`.
   */
  public async findAll(query: NetworkQueryDto): Promise<PaginatedResult<Network>> {
    const { page = 1, limit = 20, driverKey, isActive, isTestnet } = query;

    const where: FindOptionsWhere<Network> = {};
    if (driverKey !== undefined) where.driverKey = driverKey;
    if (isActive !== undefined) where.isActive = isActive;
    if (isTestnet !== undefined) where.isTestnet = isTestnet;

    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take,
      order: { createdAt: 'DESC' },
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Returns all active (non-deleted, `isActive = true`) networks.
   *
   * Intended for internal use by downstream modules (Token, Wallet, etc.)
   * that need the full list of operable networks without pagination.
   * Ordered by `name ASC` for stable, predictable enumeration.
   */
  public async findActive(): Promise<Network[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if a non-deleted network with the given slug exists.
   *
   * Uses `count` rather than `findOne` to avoid fetching the full row
   * when only existence is needed (CREATE uniqueness guard).
   */
  public async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ where: { slug } });
    return count > 0;
  }

  /**
   * Returns `true` if a non-deleted network with the given chainId exists.
   *
   * Used in `CREATE` to enforce the global uniqueness constraint on chainId
   * before hitting the database unique index.
   */
  public async existsByChainId(chainId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { chainId } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Creates and persists a new `Network` entity.
   *
   * Accepts a `Partial<Network>` so the caller (service) controls exactly
   * which fields are set. TypeORM `create()` builds the entity in memory;
   * `save()` persists it and populates auto-generated fields (`id`,
   * `createdAt`, `updatedAt`, `version`).
   *
   * Returns the fully populated saved entity.
   */
  public async create(data: Partial<Network>): Promise<Network> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Merges `changes` into an existing entity and persists the result.
   *
   * TypeORM `merge()` performs a shallow merge in memory. `save()` then
   * writes only the changed columns and increments the `@VersionColumn`
   * counter (optimistic locking).
   *
   * The caller is responsible for fetching the entity before calling update.
   * The repository never fetches inside a mutation — that is the service's job.
   *
   * Returns the updated entity with refreshed `updatedAt` and `version`.
   */
  public async update(network: Network, changes: Partial<Network>): Promise<Network> {
    this.repo.merge(network, changes);
    return this.repo.save(network);
  }

  /**
   * Soft-deletes a network by setting `deleted_at` to the current timestamp.
   *
   * Uses TypeORM `softRemove()` — the row is retained in the database for
   * referential integrity and audit purposes. Hard deletion is permanently
   * forbidden per architecture rule #4.
   *
   * After this call, all `find*` methods will automatically exclude this
   * record (TypeORM appends `WHERE deleted_at IS NULL` to every query).
   */
  public async softDelete(network: Network): Promise<void> {
    await this.repo.softRemove(network);
  }
}
