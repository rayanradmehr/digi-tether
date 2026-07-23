import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { TokenType } from '../enums/token-type.enum';
import { TokenStatus } from '../enums/token-status.enum';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type { TokenQueryDto } from '../dto/token-query.dto';

/**
 * Pure persistence layer for the `tokens` table.
 */
@Injectable()
export class TokenRepository {
  public constructor(
    @InjectRepository(Token)
    private readonly repo: Repository<Token>,
  ) {}

  public async findById(id: string): Promise<Token | null> {
    return this.repo.findOne({ where: { id } });
  }

  public async findAll(query: TokenQueryDto): Promise<PaginatedResult<Token>> {
    const { page = 1, limit = 20, networkId, type, standard, status } = query;

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

  public async findByNetworkId(networkId: string): Promise<Token[]> {
    return this.repo.find({
      where: { networkId },
      order: { symbol: 'ASC' },
    });
  }

  public async findActiveByNetworkId(networkId: string): Promise<Token[]> {
    return this.repo.find({
      where: { networkId, status: TokenStatus.ACTIVE },
      order: { symbol: 'ASC' },
    });
  }

  public async existsNativeByNetworkId(networkId: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { networkId, type: TokenType.NATIVE },
    });
    return count > 0;
  }

  public async existsBySymbolAndNetworkId(symbol: string, networkId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { symbol, networkId } });
    return count > 0;
  }

  public async existsByContractAddressAndNetworkId(
    contractAddress: string,
    networkId: string,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { contractAddress, networkId } });
    return count > 0;
  }

  public async create(data: Partial<Token>): Promise<Token> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  public async update(token: Token, changes: Partial<Token>): Promise<Token> {
    this.repo.merge(token, changes);
    return this.repo.save(token);
  }

  public async softDelete(token: Token): Promise<void> {
    await this.repo.softRemove(token);
  }
}
