import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { NetworkDriver } from '../enums/network-driver.enum';

/**
 * Represents one supported blockchain network.
 *
 * This is the **dependency root** for every other business entity in the
 * platform. All chain-aware modules (Token, Wallet, Deposit, Withdrawal,
 * Sweep, Broadcast) carry a foreign key to this table.
 *
 * Design invariants:
 * - Records are NEVER hard-deleted. Use TypeORM `softRemove()` only.
 * - `slug` and `chainId` are immutable after creation (see ADR-N-013).
 * - `driverKey` stores a `NetworkDriver` enum value; the Drivers layer maps
 *   this to a concrete implementation class at runtime.
 * - `rpcUrl` is mutable — operators may rotate RPC node endpoints at any time.
 *
 * Optimistic locking via `@VersionColumn` prevents lost-update races when
 * two operators concurrently modify the same network record.
 */
@Entity('networks')
export class Network {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  public name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  public slug!: string;

  @Column({ type: 'varchar', length: 20 })
  public symbol!: string;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'chain_id' })
  public chainId!: string;

  @Column({ type: 'smallint', name: 'native_decimals' })
  public nativeDecimals!: number;

  @Column({
    type: 'enum',
    enum: NetworkDriver,
    name: 'driver_key',
  })
  public driverKey!: NetworkDriver;

  /**
   * RPC node endpoint URL for this network.
   * Used by the Drivers layer to connect to the blockchain node.
   * Mutable — operators rotate RPC endpoints without schema changes.
   * Example: 'https://mainnet.infura.io/v3/<key>', 'https://api.trongrid.io'
   */
  @Column({ type: 'varchar', length: 500, name: 'rpc_url' })
  public rpcUrl!: string;

  @Column({ type: 'varchar', length: 255, name: 'explorer_base_url', nullable: true })
  public explorerBaseUrl!: string | null;

  @Column({ type: 'smallint', name: 'required_confirmations', default: 12 })
  public requiredConfirmations!: number;

  @Column({ type: 'smallint', name: 'block_time_seconds', default: 12 })
  public blockTimeSeconds!: number;

  @Column({ type: 'boolean', name: 'is_testnet', default: false })
  public isTestnet!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  public isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  public description!: string | null;

  @VersionColumn()
  public version!: number;

  @CreateDateColumn({ name: 'created_at' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  public deletedAt!: Date | null;
}
