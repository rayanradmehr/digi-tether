import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';

/**
 * Authoritative ownership and address-identity record for a single
 * blockchain wallet.
 *
 * The Wallet entity is a pure metadata record — it carries no blockchain
 * state, no balance, no transaction history, and no private key material.
 *
 * Design invariants (DOMAIN-MODEL.md §1):
 *
 * IMMUTABLE after creation (must never be updated post-insert):
 *   id, address, driverFamily, createdByJobId, publicKey,
 *   publicKeyFingerprint, signerVersion, createdAt.
 *
 * SET ONCE on assignment (never overwritten once non-null):
 *   customerId, assignedAt.
 *
 * MUTABLE (only via WalletService state-machine transitions):
 *   status, reservationToken, reservedAt, releasedAt, previousStatus,
 *   lockedAt, lockReason, compromisedAt, archivedAt,
 *   version, updatedAt, deletedAt.
 *
 * Hard deletion is permanently forbidden.
 * WalletService is the ONLY component permitted to call mutation methods.
 *
 * See DOMAIN-MODEL.md §4 for the full state machine.
 */
@Entity('wallets')
@Index('IDX_wallets_driver_family_status_created_at', [
  'driverFamily',
  'status',
  'createdAt',
])
@Index('IDX_wallets_status_reserved_at', ['status', 'reservedAt'])
@Index('IDX_wallets_customer_id', ['customerId'])
@Index('IDX_wallets_driver_family', ['driverFamily'])
@Check('CHK_wallets_customer_immutable', `
  -- customerId is set once; once non-null it must not change.
  -- Enforced in application layer by WalletService.
  -- This CHECK is documentation-only (TypeORM does not generate partial CHECK syntax).
  customer_id IS NULL OR customer_id = customer_id
`)
export class WalletEntity {
  // ---------------------------------------------------------------------------
  // Primary key
  // ---------------------------------------------------------------------------

  /**
   * Internal surrogate primary key.
   * UUID v4, generated server-side at insert time.
   * Never exposed to external systems as a routing key.
   */
  @ApiProperty({
    description: 'Internal surrogate primary key (UUID v4).',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  // ---------------------------------------------------------------------------
  // Core identity — IMMUTABLE after insert
  // ---------------------------------------------------------------------------

  /**
   * The blockchain address string as produced by the Offline Signer.
   *
   * Format per family:
   *   EVM     — 42-char 0x-prefixed checksummed hex (EIP-55).
   *   TRON    — Base58Check address.
   *   BITCOIN — bech32m address (P2TR).
   *   SOLANA  — Base58 public key.
   *   NEAR    — Base58 public key.
   *
   * Stored as-is (no normalisation). Comparison queries must account for
   * family-specific case rules. IMMUTABLE for the lifetime of the record.
   */
  @ApiProperty({
    description:
      'Blockchain address as produced by the Offline Signer. Immutable.',
    example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    maxLength: 128,
  })
  @Column({ type: 'varchar', length: 128, nullable: false, unique: true })
  public address!: string;

  /**
   * Cryptographic address family of this wallet.
   * Column: driver_family. Aligned with Network Module driverKey concept.
   *
   * Determines: which networks may use this address, which signing algorithm
   * is required, and which pool this wallet belongs to.
   * IMMUTABLE — address derivation is family-specific at a cryptographic level.
   */
  @ApiProperty({
    description:
      'Cryptographic address family. Determines pool membership and signing algorithm.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @Column({
    type: 'varchar',
    length: 32,
    nullable: false,
    name: 'driver_family',
  })
  public driverFamily!: WalletFamily;

  // ---------------------------------------------------------------------------
  // Lifecycle status — MUTABLE via state machine only
  // ---------------------------------------------------------------------------

  /**
   * Current lifecycle position.
   * Only WalletService may write this column.
   * Default: AVAILABLE (every wallet starts in the pool).
   */
  @ApiProperty({
    description: 'Current lifecycle state of this wallet.',
    enum: WalletStatus,
    default: WalletStatus.AVAILABLE,
    example: WalletStatus.AVAILABLE,
  })
  @Column({
    type: 'varchar',
    length: 32,
    nullable: false,
    default: WalletStatus.AVAILABLE,
  })
  public status!: WalletStatus;

  // ---------------------------------------------------------------------------
  // Customer assignment — SET ONCE on RESERVED → ASSIGNED transition
  // ---------------------------------------------------------------------------

  /**
   * Opaque external customer identifier provided by the Exchange.
   * The backend stores it verbatim and never interprets its format.
   *
   * NULL until assignment. Once set, NEVER changed (immutable post-assignment).
   * PII — must never appear in logs.
   *
   * Composite UNIQUE with driverFamily enforces one wallet per customer
   * per family at the database level.
   */
  @ApiPropertyOptional({
    description:
      'Opaque customer identifier. Set once at assignment; immutable after. PII.',
    example: 'cust_01HX5K3MZPQ8R9T2VWYX4ZBCD',
    maxLength: 128,
    nullable: true,
  })
  @Index('IDX_wallets_customer_driver_family', ['customerId', 'driverFamily'], {
    unique: true,
    where: '"customer_id" IS NOT NULL',
  })
  @Column({ type: 'varchar', length: 128, nullable: true, name: 'customer_id' })
  public customerId!: string | null;

  /**
   * Precise UTC timestamp of permanent assignment to customerId.
   * Set atomically with status → ASSIGNED. Never updated.
   */
  @ApiPropertyOptional({
    description: 'UTC timestamp of permanent assignment. Set once; immutable after.',
    example: '2026-01-15T09:23:00.000Z',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'assigned_at' })
  public assignedAt!: Date | null;

  // ---------------------------------------------------------------------------
  // Reservation — MUTABLE, cleared on assign or release
  // ---------------------------------------------------------------------------

  /**
   * UUID v4 token generated at reservation time.
   * The caller must present this token to complete Phase 2 (assignWallet).
   * Prevents a different caller from completing another caller's reservation.
   * Cleared (null) when the wallet is assigned or released.
   *
   * Partial UNIQUE index: WHERE reservation_token IS NOT NULL.
   */
  @ApiPropertyOptional({
    description:
      'One-time reservation ownership token. Present in RESERVED status only.',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    maxLength: 64,
    nullable: true,
  })
  @Index('IDX_wallets_reservation_token', ['reservationToken'], {
    unique: true,
    where: '"reservation_token" IS NOT NULL',
  })
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'reservation_token',
  })
  public reservationToken!: string | null;

  /**
   * UTC timestamp of when this wallet entered RESERVED status.
   * Used to compute reservation age for TTL enforcement by the cleanup cron.
   * Cleared (null) when released or assigned.
   */
  @ApiPropertyOptional({
    description:
      'Timestamp of reservation. Null outside RESERVED state.',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'reserved_at' })
  public reservedAt!: Date | null;

  /**
   * Records the timestamp at which a RESERVED wallet was released back to
   * AVAILABLE due to TTL expiry or explicit release.
   *
   * Non-null indicates this wallet experienced a failed reservation cycle.
   * Used in pool age analysis and reservation health monitoring.
   */
  @ApiPropertyOptional({
    description:
      'Timestamp when a timed-out reservation was released. Non-null means the wallet was once reserved but not completed.',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'released_at' })
  public releasedAt!: Date | null;

  // ---------------------------------------------------------------------------
  // SignerJob provenance — IMMUTABLE after insert
  // ---------------------------------------------------------------------------

  /**
   * Foreign key to signer_jobs.id.
   * Links this wallet to the exact CREATE_WALLET SignerJob that produced it.
   * NOT NULL — every wallet must trace to exactly one originating job.
   * UNIQUE — one wallet per SignerJob result.
   * IMMUTABLE after creation.
   */
  @ApiProperty({
    description:
      'FK to the CREATE_WALLET SignerJob that produced this wallet. NOT NULL, UNIQUE.',
    example: 'b1e2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @Index('IDX_wallets_created_by_job_id', { unique: true })
  @Column({
    type: 'uuid',
    nullable: false,
    unique: true,
    name: 'created_by_job_id',
  })
  public createdByJobId!: string;

  // ---------------------------------------------------------------------------
  // Public key fields — IMMUTABLE after insert
  // ---------------------------------------------------------------------------

  /**
   * The full uncompressed or compressed public key hex string as returned
   * by the Offline Signer in the CREATE_WALLET result.
   *
   * NOT NULL — mandatory. A CREATE_WALLET result without a public key is
   * rejected by WalletCreationResultHandler before persistence.
   * UNIQUE — one address per public key.
   * IMMUTABLE after creation.
   *
   * Not sensitive: the public key is derivable from any on-chain transaction.
   * Must never be confused with the private key, which never touches the backend.
   */
  @ApiProperty({
    description:
      'Full public key hex string from the Offline Signer. Mandatory. Immutable.',
    example:
      '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a',
  })
  @Index('IDX_wallets_public_key', { unique: true })
  @Column({
    type: 'text',
    nullable: false,
    unique: true,
    name: 'public_key',
  })
  public publicKey!: string;

  /**
   * SHA-256 fingerprint of the public key.
   * Format: `sha256:<hex>`.
   *
   * Used in audit logs and Signer result validation without transmitting
   * the full public key. Provides a tamper-evident reference to the key
   * used at generation time. NULLABLE — populated from Signer result.
   * IMMUTABLE after creation.
   */
  @ApiPropertyOptional({
    description:
      'SHA-256 fingerprint of publicKey. Format: sha256:<hex>. Audit reference.',
    example: 'sha256:a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    maxLength: 128,
    nullable: true,
  })
  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'public_key_fingerprint',
  })
  public publicKeyFingerprint!: string | null;

  /**
   * Version string of the Offline Signer binary that generated this wallet.
   * Used for incident response and audit compliance.
   * NULLABLE — populated from Signer result. IMMUTABLE after creation.
   */
  @ApiPropertyOptional({
    description: 'Offline Signer binary version that generated this wallet.',
    example: '2.4.1',
    maxLength: 32,
    nullable: true,
  })
  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    name: 'signer_version',
  })
  public signerVersion!: string | null;

  // ---------------------------------------------------------------------------
  // Lock state — MUTABLE via lockWallet / unlockWallet
  // ---------------------------------------------------------------------------

  /**
   * Snapshot of status immediately before transitioning to LOCKED.
   * Required so unlockWallet() can restore the correct prior status
   * without querying the audit log.
   * Cleared (null) after unlock restores the status.
   */
  @ApiPropertyOptional({
    description:
      'Status snapshot before LOCKED transition. Used by unlockWallet() to restore prior state.',
    enum: WalletStatus,
    nullable: true,
  })
  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    name: 'previous_status',
  })
  public previousStatus!: WalletStatus | null;

  /**
   * Timestamp of when this wallet was locked.
   * Set on status → LOCKED. Cleared (null) on unlock.
   */
  @ApiPropertyOptional({
    description: 'Timestamp of most recent lock. Null when not locked.',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'locked_at' })
  public lockedAt!: Date | null;

  /**
   * Human-readable reason provided by the operator when locking.
   * Must never contain PII or private key material.
   * Cleared (null) on unlock.
   */
  @ApiPropertyOptional({
    description:
      'Operator-supplied reason for locking. Must not contain PII or key material.',
    example: 'Suspicious withdrawal pattern detected.',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true, name: 'lock_reason' })
  public lockReason!: string | null;

  // ---------------------------------------------------------------------------
  // Terminal state timestamps — set once, never cleared
  // ---------------------------------------------------------------------------

  /**
   * Terminal timestamp. Set when status → COMPROMISED. Never cleared.
   * Non-null if and only if status = COMPROMISED.
   */
  @ApiPropertyOptional({
    description:
      'Terminal: timestamp of COMPROMISED transition. Non-null iff status = COMPROMISED.',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'compromised_at' })
  public compromisedAt!: Date | null;

  /**
   * Terminal timestamp. Set when status → ARCHIVED. Never cleared.
   * Non-null if and only if status = ARCHIVED.
   */
  @ApiPropertyOptional({
    description:
      'Terminal: timestamp of ARCHIVED transition. Non-null iff status = ARCHIVED.',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  public archivedAt!: Date | null;

  // ---------------------------------------------------------------------------
  // Audit — automatic
  // ---------------------------------------------------------------------------

  /**
   * Optimistic concurrency lock version counter.
   * Auto-incremented by TypeORM on every save().
   * Critical for race-condition-free reservation and assignment.
   */
  @VersionColumn()
  public version!: number;

  /**
   * Row creation timestamp. Set once by TypeORM. Immutable.
   * Used for FIFO pool ordering: ORDER BY created_at ASC.
   */
  @ApiProperty({
    description: 'Row creation timestamp. Used for FIFO pool ordering.',
  })
  @CreateDateColumn({ name: 'created_at' })
  public createdAt!: Date;

  /** Last mutation timestamp. Automatically maintained by TypeORM. */
  @ApiProperty({ description: 'Last mutation timestamp.' })
  @UpdateDateColumn({ name: 'updated_at' })
  public updatedAt!: Date;

  /**
   * Soft-delete timestamp. NULL for active records.
   * Hard deletion is permanently forbidden.
   * TypeORM appends WHERE deleted_at IS NULL to all queries automatically.
   */
  @ApiPropertyOptional({
    description: 'Soft-delete timestamp. Null for active records.',
    nullable: true,
  })
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  public deletedAt!: Date | null;
}
