import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, LessThan, Repository } from 'typeorm';
import { SignerJob } from '../entities/signer-job.entity';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobType } from '../enums/signer-job-type.enum';
import { paginate, buildPaginatedResult } from '@common/pagination/pagination.util';
import type { PaginatedResult } from '@common/pagination/paginated-result.type';
import type {
  ISignerJobRepository,
  SignerJobQuery,
  SignerJobStats,
} from './signer-job.repository.interface';

/**
 * Pure persistence layer for the `signer_jobs` table.
 */
@Injectable()
export class SignerJobRepository implements ISignerJobRepository {
  public constructor(
    @InjectRepository(SignerJob)
    private readonly repo: Repository<SignerJob>,
  ) {}

  public async findById(id: string): Promise<SignerJob | null> {
    return this.repo.findOne({ where: { id } });
  }

  public async findByRequestId(requestId: string): Promise<SignerJob | null> {
    return this.repo.findOne({ where: { requestId } });
  }

  public async findByReference(referenceId: string, referenceType: string): Promise<SignerJob[]> {
    return this.repo.find({
      where: { referenceId, referenceType },
      order: { createdAt: 'DESC' },
    });
  }

  public async findAvailable(networkId?: string, limit: number = 10): Promise<SignerJob[]> {
    const safeLimit = Math.min(limit, 50);
    const where: FindOptionsWhere<SignerJob> = { status: SignerJobStatus.PENDING };
    if (networkId !== undefined) {
      where.networkId = networkId;
    }
    return this.repo.find({
      where,
      order: { createdAt: 'ASC' },
      take: safeLimit,
    });
  }

  public async findAll(query: SignerJobQuery): Promise<PaginatedResult<SignerJob>> {
    const { page = 1, limit = 20, status, jobType, networkId, referenceType } = query;

    const where: FindOptionsWhere<SignerJob> = {};
    if (status !== undefined) where.status = status;
    if (jobType !== undefined) where.jobType = jobType;
    if (networkId !== undefined) where.networkId = networkId;
    if (referenceType !== undefined) where.referenceType = referenceType;

    const { skip, take } = paginate(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take,
      order: { createdAt: 'DESC' },
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  public async existsByRequestId(requestId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { requestId } });
    return count > 0;
  }

  public async getStats(): Promise<SignerJobStats> {
    const now = new Date();

    const [statusRows, typeRows, staleClaimed] = await Promise.all([
      this.repo
        .createQueryBuilder('j')
        .select('j.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('j.deleted_at IS NULL')
        .groupBy('j.status')
        .getRawMany<{ status: SignerJobStatus; count: string }>(),

      this.repo
        .createQueryBuilder('j')
        .select('j.job_type', 'jobType')
        .addSelect('COUNT(*)', 'count')
        .where('j.deleted_at IS NULL')
        .groupBy('j.job_type')
        .getRawMany<{ jobType: SignerJobType; count: string }>(),

      this.repo.count({
        where: {
          status: SignerJobStatus.CLAIMED,
          expiresAt: LessThan(now),
          deletedAt: IsNull(),
        },
      }),
    ]);

    const byStatus = Object.values(SignerJobStatus).reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<SignerJobStatus, number>,
    );
    for (const row of statusRows) {
      byStatus[row.status] = parseInt(row.count, 10);
    }

    const byType = Object.values(SignerJobType).reduce(
      (acc, t) => ({ ...acc, [t]: 0 }),
      {} as Record<SignerJobType, number>,
    );
    for (const row of typeRows) {
      byType[row.jobType] = parseInt(row.count, 10);
    }

    return { byStatus, byType, staleClaimed };
  }

  public async create(data: Partial<SignerJob>): Promise<SignerJob> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  public async update(job: SignerJob, changes: Partial<SignerJob>): Promise<SignerJob> {
    this.repo.merge(job, changes);
    return this.repo.save(job);
  }

  public async softDelete(job: SignerJob): Promise<void> {
    await this.repo.softRemove(job);
  }
}
