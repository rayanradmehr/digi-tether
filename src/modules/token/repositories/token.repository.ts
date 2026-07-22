import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { TokenStandard } from '../enums/token-standard.enum';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type { TokenQueryDto } from '../dto/token-query.dto';

/**
 * Pure persistence layer for the `tokens` table.
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
 * - Must never throw domain exceptions — returns `null` on miss, `false` on absent.
 * - Must never expose the raw TypeORM `Repository<Token>` to callers.
 * - Must never import DTO classes except for read-only type annotations.
 */
@Injectable()
export class TokenRepository {
  public constructor(
    @InjectRepository(Token)
    private readonly repo: Repository<Token>,
  ) {}

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /**
   * Finds a token by its UUID primary key.
   *
   * Returns `null` when the UUID does not exist or the record is soft-deleted.
   * TypeORM automatically appends `WHERE deleted_at IS NULL`.
   */
  public async findById(id: string): Promise<Token | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Returns a paginated, optionally filtered list of live (non-deleted) tokens.
   *
   * Applied filters (all optional, combined with AND):
   * - `networkId` — exact UUID match.
   * - `type`      — `TokenType` enum equality.
   * - `standard`  — `TokenStandard` enum equality.
   * - `status`    — `TokenStatus` enum equality.
   *
   * Results are ordered by `created_at DESC` (newest first).
   */
  public async findAll(query: TokenQueryDto): Promise<PaginatedResult<Token>> {
    const {
      page = 1,
      limit = 20,
      networkId,
      type,
      standard,
      status,
    } = query;

    const where: FindOptionsWhere<Token> = {};
    if (networkId !== undefined) where.networkId = networkId;
    if (type !== undefined) where.type = type;
    if (standard !== undefined) where.standard = standard;
    if (status !== undefined) where.status = status;

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
   * Returns all live tokens that belong to the given network.
   *
   * Not paginated — intended for internal downstream module use where a
   * complete list is needed (e.g., Deposit Scanner loading all tokens for a network).
   */
  public async findByNetworkId(networkId: string): Promise<Token[]> {
    return this.repo.find({
      where: { networkId },
      order: { symbol: 'ASC' },
    });
  }

  /**
   * Returns all ACTIVE live tokens that belong to the given network.
   *
   * Used by downstream modules (Wallet, Deposit) as a gate-check list.
   */
  public async findActiveByNetworkId(networkId: string): Promise<Token[]> {
    return this.repo.find({
      where: { networkId, status: TokenStatus.ACTIVE },
      order: { symbol: 'ASC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` if a live native token already exists for the given network.
   * Used to enforce Invariant 1 (one native token per network).
   */
  public async existsNativeByNetworkId(networkId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { networkId, type: TokenType.NATIVE },
    });
    return count > 0;
  }

  /**
   * Returns `true` if a live token with the given symbol exists on the network.
   * Used to enforce Invariant 5 ((networkId, symbol) uniqueness).
   */
  public async existsBySymbolAndNetworkId(
    symbol: string,
    networkId: string,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { symbol, networkId } });
    return count > 0;
  }

  /**
   * Returns `true` if a live contract token with the given address exists on
   * the network. Used to enforce Invariant 4 ((networkId, contractAddress) uniqueness).
   */
  public async existsByContractAddressAndNetworkId(
    contractAddress: string,
    networkId: string,
  ): Promise<boolean> {
    const count = await this.repo.count({
      where: { contractAddress, networkId },
    });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  /**
   * Creates and persists a new `Token` entity.
   *
   * TypeORM `create()` builds the entity in memory; `save()` persists it and
   * populates auto-generated fields (`id`, `createdAt`, `updatedAt`, `version`).
   */
  public async create(data: Partial<Token>): Promise<Token> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  /**
   * Merges `changes` into an existing entity and persists the result.
   *
   * TypeORM `merge()` performs a shallow in-memory merge. `save()` writes
   * only changed columns and increments the `@VersionColumn` counter.
   *
   * The caller is responsible for fetching the entity before calling update.
   */
  public async update(token: Token, changes: Partial<Token>): Promise<Token> {
    this.repo.merge(token, changes);
    return this.repo.save(token);
  }

  /**
   * Soft-deletes a token by setting `deleted_at` to the current timestamp.
   *
   * Uses TypeORM `softRemove()` — the row is retained permanently for
   * referential integrity and audit. Hard deletion is forbidden (Invariant 12).
   */
  public async softDelete(token: Token): Promise<void> {
    await this.repo.softRemove(token);
  }
}
