import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Network } from '../entities/network.entity';
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

  public async findById(id: string): Promise<Network | null> {
    return this.repo.findOne({ where: { id } });
  }

  public async findBySlug(slug: string): Promise<Network | null> {
    return this.repo.findOne({ where: { slug } });
  }

  public async findByChainId(chainId: string): Promise<Network | null> {
    return this.repo.findOne({ where: { chainId } });
  }

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

  public async findActive(): Promise<Network[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  public async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ where: { slug } });
    return count > 0;
  }

  public async existsByChainId(chainId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { chainId } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  public async create(data: Partial<Network>): Promise<Network> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  public async update(network: Network, changes: Partial<Network>): Promise<Network> {
    this.repo.merge(network, changes);
    return this.repo.save(network);
  }

  public async softDelete(network: Network): Promise<void> {
    await this.repo.softRemove(network);
  }
}
