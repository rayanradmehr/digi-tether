import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Network } from '../entities/network.entity';
import type { NetworkQueryDto } from '../dto/network-query.dto';
import { paginate } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import { buildPaginatedResult } from '@common/pagination/pagination.util';

/**
 * Data-access layer for the `networks` table.
 *
 * Contains only typed query methods — no business logic, no guards,
 * no activation checks. All business rules live in `NetworkService`.
 */
@Injectable()
export class NetworkRepository {
  public constructor(
    @InjectRepository(Network)
    private readonly repo: Repository<Network>,
  ) {}

  /** Finds a single network by UUID. Returns `null` if not found or soft-deleted. */
  public async findById(id: string): Promise<Network | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Finds a single network by its URL-safe slug. */
  public async findBySlug(slug: string): Promise<Network | null> {
    return this.repo.findOne({ where: { slug } });
  }

  /** Finds a single network by its chain-level identifier. */
  public async findByChainId(chainId: string): Promise<Network | null> {
    return this.repo.findOne({ where: { chainId } });
  }

  /** Returns all non-deleted networks matching optional filters, paginated. */
  public async findAll(query: NetworkQueryDto): Promise<PaginatedResult<Network>> {
    const { page = 1, limit = 20, driverKey, isActive, isTestnet } = query;
    const where: FindOptionsWhere<Network> = {};

    if (driverKey !== undefined) where.driverKey = driverKey;
    if (isActive !== undefined) where.isActive = isActive;
    if (isTestnet !== undefined) where.isTestnet = isTestnet;

    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({ where, skip, take, order: { createdAt: 'DESC' } });
    return buildPaginatedResult(data, total, page, limit);
  }

  /** Persists a new network entity. Returns the saved entity. */
  public async create(network: Partial<Network>): Promise<Network> {
    const entity = this.repo.create(network);
    return this.repo.save(entity);
  }

  /** Merges updates into an existing entity and saves. */
  public async update(network: Network, changes: Partial<Network>): Promise<Network> {
    this.repo.merge(network, changes);
    return this.repo.save(network);
  }

  /** Soft-deletes the record. Sets `deletedAt`; row is retained for audit. */
  public async softDelete(network: Network): Promise<void> {
    await this.repo.softRemove(network);
  }
}
