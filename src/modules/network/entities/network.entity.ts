import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Represents one supported blockchain network.
 *
 * This is the dependency root for every other business entity.
 * All chain-aware modules (Token, Wallet, Deposit, …) carry a foreign key
 * to this table. Records are never hard-deleted — use `softRemove()` only.
 */
@Entity('networks')
export class Network {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  /** Human-readable display name. Example: 'Ethereum' */
  @Column({ type: 'varchar', length: 100, unique: true })
  public name!: string;

  /**
   * URL-safe unique identifier. Example: 'ethereum-mainnet'
   * Immutable after creation — changing it breaks external references.
   */
  @Column({ type: 'varchar', length: 100, unique: true })
  public slug!: string;

  /** Native currency ticker. Example: 'ETH', 'TRX', 'BNB' */
  @Column({ type: 'varchar', length: 20 })
  public symbol!: string;

  /**
   * Chain-level numeric or string identifier.
   * EIP-155 integer for EVM chains; genesis hash prefix for others.
   * Unique and immutable after creation.
   */
  @Column({ type: 'varchar', length: 100, unique: true, name: 'chain_id' })
  public chainId!: string;

  /** Decimal precision of the native currency. Example: 18 for ETH, 6 for TRX */
  @Column({ type: 'smallint', name: 'native_decimals' })
  public nativeDecimals!: number;

  /**
   * String key that maps this network to its driver implementation.
   * Example: 'evm', 'tron', 'solana'.
   * The Drivers layer owns the mapping from this key to a concrete class.
   * Never a foreign key — drivers are code, not database rows.
   */
  @Column({ type: 'varchar', length: 50, name: 'driver_key' })
  public driverKey!: string;

  /** Block explorer base URL. Example: 'https://etherscan.io' */
  @Column({ type: 'varchar', length: 255, name: 'explorer_base_url' })
  public explorerBaseUrl!: string;

  /**
   * Minimum block confirmations required before a deposit is considered final.
   * Read by the Deposit Scanner.
   */
  @Column({ type: 'smallint', name: 'required_confirmations', default: 12 })
  public requiredConfirmations!: number;

  /** Approximate block time in seconds. Informational only — not used for timing logic. */
  @Column({ type: 'smallint', name: 'block_time_seconds', default: 12 })
  public blockTimeSeconds!: number;

  /** Whether this is a test network. Testnet records may have relaxed rules in non-production. */
  @Column({ type: 'boolean', name: 'is_testnet', default: false })
  public isTestnet!: boolean;

  /**
   * Activation gate. Inactive networks are rejected by every downstream module
   * before any on-chain operation is attempted.
   */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  public isActive!: boolean;

  /** Optional human-readable description of the network. */
  @Column({ type: 'text', nullable: true })
  public description!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  public updatedAt!: Date;

  /** Soft-delete timestamp. Never set this manually — use TypeORM softRemove(). */
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  public deletedAt!: Date | null;
}
