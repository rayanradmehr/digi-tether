import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletFamily } from '../enums/wallet-family.enum';
import { WalletStatus } from '../enums/wallet-status.enum';
import type { WalletEntity } from '../entities/wallet.entity';

/**
 * Public API response shape for a single wallet.
 *
 * ## Field exclusion policy (security-critical)
 * Fields present in `WalletEntity` that are NEVER included in any API response:
 *
 * | Field | Reason excluded |
 * |---|---|
 * | `publicKey` | Not exposed to Exchange callers. Internal audit use only. |
 * | `publicKeyFingerprint` | Internal audit. Not actionable by Exchange. |
 * | `signerVersion` | Internal audit. Not actionable by Exchange. |
 * | `createdByJobId` | Internal provenance. Not actionable by Exchange. |
 * | `reservationToken` | Internal 2-phase protocol token. Never exposed. |
 * | `reservedAt` | Internal protocol field. Not actionable by Exchange. |
 * | `releasedAt` | Internal protocol field. |
 * | `previousStatus` | Internal state-machine field. |
 * | `version` | TypeORM internal. Never expose ORM version counters. |
 * | `deletedAt` | Soft-delete internals. Deleted wallets are not returned. |
 *
 * ## Mapping
 * Constructed explicitly from `WalletEntity` by WalletService.
 * Never use spread or `Object.assign` — explicit mapping is mandatory
 * to prevent accidental field leakage.
 *
 * ## PII handling
 * `customerId` is PII. Callers should log at INFO level at most,
 * never at DEBUG level where full response bodies may be serialised.
 */
export class WalletResponseDto {
  /**
   * Internal surrogate primary key.
   * Stable reference for subsequent API calls (lock, unlock, audit).
   */
  @ApiProperty({
    description: 'Internal surrogate primary key (UUID v4).',
    example: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  })
  public readonly id!: string;

  /**
   * Blockchain address. This is the value the Exchange should use
   * to direct on-chain deposits and withdrawals.
   */
  @ApiProperty({
    description: 'Blockchain address. Direct deposits and withdrawals to this address.',
    example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  })
  public readonly address!: string;

  /**
   * Cryptographic address family. Tells the Exchange which networks
   * are compatible with this wallet address.
   */
  @ApiProperty({
    description:
      'Cryptographic address family. Indicates network compatibility.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  public readonly driverFamily!: WalletFamily;

  /**
   * Current lifecycle state of this wallet.
   */
  @ApiProperty({
    description: 'Current lifecycle state.',
    enum: WalletStatus,
    example: WalletStatus.ASSIGNED,
  })
  public readonly status!: WalletStatus;

  /**
   * Opaque customer identifier. Present only after assignment.
   * PII — handle with appropriate care.
   */
  @ApiPropertyOptional({
    description: 'Opaque customer identifier. Present only after assignment. PII.',
    example: 'cust_01HX5K3MZPQ8R9T2VWYX4ZBCD',
    nullable: true,
  })
  public readonly customerId!: string | null;

  /**
   * UTC timestamp of permanent assignment. Null until assigned.
   */
  @ApiPropertyOptional({
    description: 'UTC timestamp of permanent assignment to customerId. Null until assigned.',
    example: '2026-01-15T09:23:00.000Z',
    nullable: true,
  })
  public readonly assignedAt!: Date | null;

  /**
   * Operator lock reason. Present only while status = LOCKED.
   */
  @ApiPropertyOptional({
    description: 'Operator lock reason. Non-null only while status = LOCKED.',
    example: 'Suspicious withdrawal pattern detected.',
    nullable: true,
  })
  public readonly lockReason!: string | null;

  /**
   * Terminal timestamp. Non-null only when status = COMPROMISED.
   */
  @ApiPropertyOptional({
    description: 'Terminal: timestamp of COMPROMISED transition. Non-null iff status = COMPROMISED.',
    nullable: true,
  })
  public readonly compromisedAt!: Date | null;

  /**
   * Terminal timestamp. Non-null only when status = ARCHIVED.
   */
  @ApiPropertyOptional({
    description: 'Terminal: timestamp of ARCHIVED transition. Non-null iff status = ARCHIVED.',
    nullable: true,
  })
  public readonly archivedAt!: Date | null;

  /** Row creation timestamp. */
  @ApiProperty({
    description: 'Row creation timestamp (ISO 8601 UTC).',
    example: '2026-01-01T00:00:00.000Z',
  })
  public readonly createdAt!: Date;

  /** Last mutation timestamp. */
  @ApiProperty({
    description: 'Last mutation timestamp (ISO 8601 UTC).',
    example: '2026-01-15T09:23:00.000Z',
  })
  public readonly updatedAt!: Date;

  /**
   * Static factory method. Constructs a `WalletResponseDto` from a
   * `WalletEntity` using explicit field mapping.
   *
   * Spread and Object.assign are permanently forbidden here to prevent
   * accidental leakage of internal fields (publicKey, reservationToken, etc.).
   */
  public static fromEntity(entity: WalletEntity): WalletResponseDto {
    const dto = new WalletResponseDto();
    (dto as { id: string }).id = entity.id;
    (dto as { address: string }).address = entity.address;
    (dto as { driverFamily: WalletFamily }).driverFamily = entity.driverFamily;
    (dto as { status: WalletStatus }).status = entity.status;
    (dto as { customerId: string | null }).customerId = entity.customerId;
    (dto as { assignedAt: Date | null }).assignedAt = entity.assignedAt;
    (dto as { lockReason: string | null }).lockReason = entity.lockReason;
    (dto as { compromisedAt: Date | null }).compromisedAt = entity.compromisedAt;
    (dto as { archivedAt: Date | null }).archivedAt = entity.archivedAt;
    (dto as { createdAt: Date }).createdAt = entity.createdAt;
    (dto as { updatedAt: Date }).updatedAt = entity.updatedAt;
    return dto;
  }
}

/**
 * Paginated wallet list response.
 *
 * Compatible with the project's cursor-free offset pagination pattern.
 * Wraps an array of `WalletResponseDto` with standard pagination metadata.
 */
export class PaginatedWalletResponseDto {
  /**
   * The page of wallet records matching the query.
   */
  @ApiProperty({
    type: () => WalletResponseDto,
    isArray: true,
    description: 'Array of wallet records for the current page.',
  })
  public readonly data!: WalletResponseDto[];

  /**
   * Total number of records matching the query filters
   * (before pagination is applied).
   */
  @ApiProperty({
    description: 'Total records matching the query (before pagination).',
    example: 1250,
  })
  public readonly total!: number;

  /**
   * Current page number (1-based).
   */
  @ApiProperty({
    description: 'Current page number (1-based).',
    example: 1,
    minimum: 1,
  })
  public readonly page!: number;

  /**
   * Maximum number of records per page as requested.
   */
  @ApiProperty({
    description: 'Requested page size.',
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  public readonly limit!: number;

  /**
   * Total number of pages given the current `limit`.
   * Computed as `Math.ceil(total / limit)`.
   */
  @ApiProperty({
    description: 'Total pages given current limit. Equals Math.ceil(total / limit).',
    example: 25,
  })
  public readonly totalPages!: number;

  /**
   * Whether a next page exists (`page < totalPages`).
   */
  @ApiProperty({
    description: 'True when a next page exists.',
    example: true,
  })
  public readonly hasNextPage!: boolean;

  /**
   * Whether a previous page exists (`page > 1`).
   */
  @ApiProperty({
    description: 'True when a previous page exists.',
    example: false,
  })
  public readonly hasPreviousPage!: boolean;

  /**
   * Static factory. Constructs pagination metadata from raw values.
   * `total` and `limit` must both be ≥ 1.
   */
  public static of(
    data: WalletResponseDto[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedWalletResponseDto {
    const dto = new PaginatedWalletResponseDto();
    const totalPages = Math.ceil(total / limit);
    (dto as { data: WalletResponseDto[] }).data = data;
    (dto as { total: number }).total = total;
    (dto as { page: number }).page = page;
    (dto as { limit: number }).limit = limit;
    (dto as { totalPages: number }).totalPages = totalPages;
    (dto as { hasNextPage: boolean }).hasNextPage = page < totalPages;
    (dto as { hasPreviousPage: boolean }).hasPreviousPage = page > 1;
    return dto;
  }
}
