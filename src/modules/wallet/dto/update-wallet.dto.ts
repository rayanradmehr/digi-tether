import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WalletStatus } from '../enums/wallet-status.enum';

/**
 * Permissible mutation fields for admin wallet lifecycle operations.
 *
 * This DTO is used INTERNALLY by `WalletService` to carry operator-supplied
 * parameters for lock/unlock/compromise/archive transitions.
 * It is NOT a catch-all update DTO — only fields that can be legitimately
 * changed by an operator are exposed.
 *
 * ## Fields deliberately excluded
 * The following fields are NEVER updatable via any external API call:
 * - `address`         — immutable (cryptographic identity)
 * - `driverFamily`    — immutable (cryptographic family)
 * - `publicKey`       — immutable (key material)
 * - `publicKeyFingerprint` — immutable
 * - `signerVersion`   — immutable
 * - `createdByJobId`  — immutable (provenance)
 * - `customerId`      — set once at assignment; immutable after
 * - `assignedAt`      — set once at assignment; immutable after
 * - `reservationToken`, `reservedAt`, `releasedAt` — managed by 2-phase protocol
 * - `version`         — managed by TypeORM @VersionColumn
 * - `createdAt`       — managed by TypeORM @CreateDateColumn
 *
 * ## Allowed transitions via this DTO
 * | Operation | status set to | lockReason | previousStatus |
 * |---|---|---|---|
 * | lockWallet()   | LOCKED | required | snapshot of current status |
 * | unlockWallet() | previousStatus | cleared | cleared |
 * | compromise()   | COMPROMISED | optional | — |
 * | archive()      | ARCHIVED | — | — |
 *
 * Business logic for which transitions are legal lives exclusively
 * in `WalletService`, not in this DTO.
 */
export class UpdateWalletDto {
  /**
   * Target lifecycle state.
   * Only the following transitions are ever set via this DTO by WalletService:
   * - AVAILABLE, ASSIGNED, LOCKED, COMPROMISED, ARCHIVED.
   * RESERVED is never set via UpdateWalletDto — it is set via
   * WalletRepository.reserveWallet() directly inside the transaction.
   */
  @ApiPropertyOptional({
    description:
      'Target lifecycle state. Set only by WalletService for permitted transitions.',
    enum: WalletStatus,
    example: WalletStatus.LOCKED,
  })
  @IsOptional()
  @IsEnum(WalletStatus)
  public readonly status?: WalletStatus;

  /**
   * Human-readable reason for the lock operation.
   * Required by WalletService when transitioning to LOCKED.
   * Ignored on any other transition.
   * Must not contain PII or key material.
   */
  @ApiPropertyOptional({
    description:
      'Operator-supplied reason for locking. Must not contain PII or key material. ' +
      'Required for LOCKED transition; ignored on others.',
    example: 'Suspicious withdrawal pattern detected — hold pending review.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  public readonly lockReason?: string;
}
