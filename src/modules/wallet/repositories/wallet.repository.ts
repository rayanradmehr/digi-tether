import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { WalletEntity } from '../entities/wallet.entity';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletQueryDto } from '../dto/wallet-query.dto';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type {
  IWalletRepository,
  WalletAssignParams,
  WalletReservationResult,
  WalletStatusCountMap,
} from './wallet.repository.interface';

@Injectable()
export class WalletRepository implements IWalletRepository {
  public constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: Repository<WalletEntity>,
    private readonly dataSource: DataSource,
  ) {}

  public async findById(id: string): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  public async findByAddress(address: string): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { address } });
  }

  public async findByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<WalletEntity | null> {
    return this.repo.findOne({ where: { customerId, driverFamily } });
  }

  public async findAllByCustomer(customerId: string): Promise<WalletEntity[]> {
    return this.repo.find({
      where: { customerId },
      order: { driverFamily: 'ASC' },
    });
  }

  public async findByDriverFamily(
    driverFamily: WalletFamily,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<WalletEntity>> {
    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where: { driverFamily },
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
    return buildPaginatedResult(data, total, page, limit);
  }

  public async findAll(query: WalletQueryDto): Promise<PaginatedResult<WalletEntity>> {
    const { page = 1, limit = 50, driverFamily, status, customerId, createdByJobId } = query;

    const where: FindOptionsWhere<WalletEntity> = {};
    if (driverFamily !== undefined) where.driverFamily = driverFamily;
    if (status !== undefined) where.status = status;
    if (customerId !== undefined) where.customerId = customerId;
    if (createdByJobId !== undefined) where.createdByJobId = createdByJobId;

    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
    return buildPaginatedResult(data, total, page, limit);
  }

  public async existsByAddress(address: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('w')
      .withDeleted()
      .where('w.address = :address', { address })
      .getCount();
    return count > 0;
  }

  public async existsByCustomer(
    customerId: string,
    driverFamily: WalletFamily,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { customerId, driverFamily } });
    return count > 0;
  }

  public async countAvailable(driverFamily: WalletFamily): Promise<number> {
    return this.repo.count({
      where: { driverFamily, status: WalletStatus.AVAILABLE },
    });
  }

  public async countByStatus(driverFamily: WalletFamily): Promise<WalletStatusCountMap> {
    const rows = await this.repo
      .createQueryBuilder('w')
      .select('w.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('w.driver_family = :driverFamily', { driverFamily })
      .andWhere('w.deleted_at IS NULL')
      .groupBy('w.status')
      .getRawMany<{ status: WalletStatus; count: string }>();

    const result = Object.values(WalletStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as WalletStatusCountMap,
    );
    for (const row of rows) {
      result[row.status] = parseInt(row.count, 10);
    }
    return result;
  }

  public async save(data: Partial<WalletEntity>): Promise<WalletEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  public async reserveWallet(
    driverFamily: WalletFamily,
  ): Promise<WalletReservationResult | null> {
    const result = await this.dataSource.query<
      Array<{ id: string; reservation_token: string }>
    >(
      `
      UPDATE wallets
      SET
        status            = 'RESERVED',
        reservation_token = gen_random_uuid()::varchar,
        reserved_at       = NOW(),
        version           = version + 1
      WHERE id = (
        SELECT id
        FROM wallets
        WHERE driver_family = $1
          AND status        = 'AVAILABLE'
          AND deleted_at    IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      AND status    = 'AVAILABLE'
      AND deleted_at IS NULL
      RETURNING id, reservation_token
      `,
      [driverFamily],
    );

    if (result.length === 0) return null;

    const row = result[0];
    if (!row) return null;

    return {
      walletId: row.id,
      reservationToken: row.reservation_token,
    };
  }

  public async assignWallet(params: WalletAssignParams): Promise<WalletEntity> {
    const { walletId, reservationToken, customerId } = params;

    const result = await this.dataSource.query<Array<{ id: string }>>(
      `
      UPDATE wallets
      SET
        status            = 'ASSIGNED',
        customer_id       = $1,
        assigned_at       = NOW(),
        reservation_token = NULL,
        reserved_at       = NULL,
        version           = version + 1,
        updated_at        = NOW()
      WHERE id                = $2
        AND reservation_token = $3
        AND status            = 'RESERVED'
        AND deleted_at        IS NULL
      RETURNING id
      `,
      [customerId, walletId, reservationToken],
    );

    if (result.length === 0) {
      const { WalletReservationTokenMismatchError } = await import(
        '../errors/wallet-reservation-token-mismatch.error'
      );
      throw new WalletReservationTokenMismatchError(walletId);
    }

    return this.repo.findOneOrFail({ where: { id: walletId } });
  }

  public async releaseExpiredReservations(ttlSeconds: number): Promise<number> {
    const result = await this.dataSource.query<Array<{ id: string }>>(
      `
      UPDATE wallets
      SET
        status            = 'AVAILABLE',
        reservation_token = NULL,
        reserved_at       = NULL,
        released_at       = NOW(),
        version           = version + 1,
        updated_at        = NOW()
      WHERE status      = 'RESERVED'
        AND reserved_at < NOW() - ($1 || ' seconds')::interval
        AND deleted_at  IS NULL
      RETURNING id
      `,
      [ttlSeconds.toString()],
    );
    return result.length;
  }

  public async lockWallet(id: string, reason: string): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        previous_status = status,
        status          = 'LOCKED',
        locked_at       = NOW(),
        lock_reason     = $1,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $2
        AND status     NOT IN ('COMPROMISED', 'ARCHIVED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  public async unlockWallet(id: string): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status          = previous_status,
        previous_status = NULL,
        locked_at       = NULL,
        lock_reason     = NULL,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $1
        AND status     = 'LOCKED'
        AND deleted_at IS NULL
      `,
      [id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  public async compromiseWallet(id: string, reason: string): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status          = 'COMPROMISED',
        compromised_at  = NOW(),
        lock_reason     = $1,
        version         = version + 1,
        updated_at      = NOW()
      WHERE id         = $2
        AND status     NOT IN ('COMPROMISED', 'ARCHIVED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  public async archiveWallet(id: string, reason: string): Promise<WalletEntity> {
    await this.dataSource.query(
      `
      UPDATE wallets
      SET
        status      = 'ARCHIVED',
        archived_at = NOW(),
        lock_reason = $1,
        version     = version + 1,
        updated_at  = NOW()
      WHERE id         = $2
        AND status     IN ('AVAILABLE', 'LOCKED')
        AND deleted_at IS NULL
      `,
      [reason, id],
    );
    return this.repo.findOneOrFail({ where: { id } });
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
