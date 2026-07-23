import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletFamily } from '../enums/wallet-family.enum';

/**
 * Per-family wallet pool configuration.
 * One row per WalletFamily. Configurable at runtime without code deployment.
 *
 * Owned by WalletPoolService. Only WalletPoolService may write to this entity.
 *
 * Column `reservation_ttl_seconds` is used by:
 *   - WalletReservationCleanupTask — to compute the expiry window.
 *   - WalletRepository.releaseExpiredReservations() — injected at query time.
 *
 * See ARCHITECTURE.md §9.2 and §5.2.
 */
@Entity('wallet_pool_config')
export class WalletPoolConfigEntity {
  /**
   * Internal surrogate primary key.
   * UUID v4, generated server-side at insert time.
   */
  @ApiProperty({
    description: 'Internal surrogate primary key (UUID v4).',
    example: 'c7b5e4d2-1234-4abc-bdef-000000000001',
  })
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  /**
   * The wallet family this configuration row governs.
   * UNIQUE — exactly one configuration row per family.
   * IMMUTABLE after creation.
   */
  @ApiProperty({
    description: 'Wallet family governed by this configuration row. One row per family.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @Index('IDX_wallet_pool_config_family', { unique: true })
  @Column({
    type: 'varchar',
    length: 32,
    nullable: false,
    unique: true,
  })
  public family!: WalletFamily;

  /**
   * Target AVAILABLE count after replenishment completes.
   * Default: 500.
   */
  @ApiProperty({
    description: 'Target AVAILABLE wallet count per family after replenishment.',
    example: 500,
    default: 500,
  })
  @Column({ type: 'int', nullable: false, default: 500, name: 'min_pool_size' })
  public minPoolSize!: number;

  /**
   * Trigger replenishment when AVAILABLE count drops below this value.
   * Default: 100.
   */
  @ApiProperty({
    description: 'Replenishment is triggered when AVAILABLE count falls below this threshold.',
    example: 100,
    default: 100,
  })
  @Column({
    type: 'int',
    nullable: false,
    default: 100,
    name: 'replenish_threshold',
  })
  public replenishThreshold!: number;

  /**
   * Number of CREATE_WALLET SignerJobs issued per replenishment cycle.
   * Default: 50.
   */
  @ApiProperty({
    description: 'Number of CREATE_WALLET SignerJobs created per replenishment cycle.',
    example: 50,
    default: 50,
  })
  @Column({ type: 'int', nullable: false, default: 50, name: 'batch_size' })
  public batchSize!: number;

  /**
   * Maximum number of simultaneously active CREATE_WALLET SignerJobs.
   * Prevents flooding the Signer queue.
   * Default: 10.
   */
  @ApiProperty({
    description: 'Maximum simultaneously active CREATE_WALLET SignerJobs for this family.',
    example: 10,
    default: 10,
  })
  @Column({
    type: 'int',
    nullable: false,
    default: 10,
    name: 'max_concurrent_jobs',
  })
  public maxConcurrentJobs!: number;

  /**
   * Seconds before an expired RESERVED wallet is released back to AVAILABLE.
   * Used by WalletReservationCleanupTask and injected into the
   * releaseExpiredReservations() repository query.
   * Default: 30.
   */
  @ApiProperty({
    description:
      'TTL in seconds for a RESERVED wallet. Expired reservations are released back to AVAILABLE.',
    example: 30,
    default: 30,
  })
  @Column({
    type: 'int',
    nullable: false,
    default: 30,
    name: 'reservation_ttl_seconds',
  })
  public reservationTtlSeconds!: number;

  /**
   * When false, pool monitoring and replenishment are disabled for this family.
   * Allows maintenance windows without removing the configuration row.
   * Default: true.
   */
  @ApiPropertyOptional({
    description: 'When false, pool monitoring and replenishment are paused for this family.',
    example: true,
    default: true,
  })
  @Column({ type: 'boolean', nullable: false, default: true, name: 'is_active' })
  public isActive!: boolean;

  /** Last mutation timestamp. Automatically maintained by TypeORM. */
  @ApiProperty({ description: 'Last mutation timestamp.' })
  @UpdateDateColumn({ name: 'updated_at' })
  public updatedAt!: Date;
}
