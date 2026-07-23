import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WalletFamily } from '../enums/wallet-family.enum';

/**
 * Request body for `POST /v1/wallets/assign`.
 *
 * The Exchange calls this endpoint to permanently assign a pre-generated
 * wallet from the pool to one of its customers.
 *
 * Processed by `WalletService.assignWallet()` which executes the
 * mandatory 2-phase reservation protocol (ADR-WM-010).
 *
 * ## Validation rules
 * - `customerId` must be a non-empty string, 1–128 chars.
 *   It is opaque — the backend never interprets its contents (ADR-WM-004).
 *   PII — never log this value.
 * - `driverFamily` must be a recognised `WalletFamily` enum value.
 *
 * ## Idempotency
 * If the customer already has a wallet for the requested family, the service
 * returns the existing wallet without creating a second one.
 *
 * ## What this DTO does NOT contain
 * - No address — chosen by the service from the pool.
 * - No reservationToken — managed internally by the 2-phase protocol.
 * - No status — always AVAILABLE → RESERVED → ASSIGNED.
 * - No cryptographic material of any kind.
 */
export class AssignWalletDto {
  /**
   * Opaque external customer identifier supplied by the Exchange.
   * The backend stores and returns this value verbatim.
   * Must be unique and stable within the Exchange's identity space.
   *
   * PII — must never appear in logs, error messages, or audit payloads.
   */
  @ApiProperty({
    description:
      'Opaque customer identifier provided by the Exchange. PII — never log. ' +
      'Unique per customer within the Exchange identity space.',
    example: 'cust_01HX5K3MZPQ8R9T2VWYX4ZBCD',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  public readonly customerId!: string;

  /**
   * Cryptographic address family for which to assign a wallet.
   * Determines which pool is consumed and which signing algorithm
   * the resulting wallet requires.
   */
  @ApiProperty({
    description:
      'Cryptographic address family. Determines which pool is consumed.',
    enum: WalletFamily,
    example: WalletFamily.EVM,
  })
  @IsEnum(WalletFamily)
  public readonly driverFamily!: WalletFamily;
}
