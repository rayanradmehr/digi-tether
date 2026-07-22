import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUrl,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TokenStatus } from '../enums/token-status.enum';

/**
 * Input DTO for partially updating a token (`PATCH /tokens/:id`).
 *
 * All fields are optional — an empty body is valid and produces no change.
 *
 * Immutable fields are structurally absent (ADR-T-006, Invariants 8–11):
 * - `networkId`        (Invariant 10 — immutable)
 * - `type`            (Invariant 11 — immutable)
 * - `standard`        (encodes protocol identity — immutable)
 * - `contractAddress` (Invariant 9  — immutable)
 * - `decimals`        (Invariant 8  — immutable)
 *
 * The `whitelist: true` global `ValidationPipe` silently strips any
 * of the above fields if a caller supplies them, providing defence-in-depth.
 *
 * Status transitions with restrictions (enforced by `TokenService`):
 *   DEPRECATED → ACTIVE    ❌ FORBIDDEN
 *   DEPRECATED → INACTIVE  ❌ FORBIDDEN
 */
export class UpdateTokenDto {
  /** Human-readable display name. */
  @ApiPropertyOptional({
    example: 'Tether USD',
    description: 'Human-readable display name of the asset.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public name?: string;

  /**
   * Ticker symbol.
   * Format: 1–20 uppercase alphanumeric characters.
   * Must be unique per network among live records.
   */
  @ApiPropertyOptional({
    example: 'USDT',
    description:
      'Ticker symbol. 1–20 uppercase alphanumeric chars. ' +
      'Must remain unique per network.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{1,20}$/, {
    message: 'symbol must be 1–20 uppercase alphanumeric characters (A–Z, 0–9).',
  })
  public symbol?: string;

  /**
   * Lifecycle status.
   * Transition DEPRECATED → * is rejected by `TokenService`.
   */
  @ApiPropertyOptional({
    enum: TokenStatus,
    example: TokenStatus.INACTIVE,
    description:
      'Lifecycle status. DEPRECATED is a terminal state — ' +
      'transitions FROM deprecated are forbidden.',
  })
  @IsOptional()
  @IsEnum(TokenStatus)
  public status?: TokenStatus;

  /**
   * Per-token confirmation override.
   * Pass `null` explicitly to restore the network default.
   * Range when non-null: 1–500.
   */
  @ApiPropertyOptional({
    example: 20,
    nullable: true,
    description:
      'Override confirmation count for this token. ' +
      'Pass null to restore the network default. Range 1–500.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public confirmationsOverride?: number | null;

  /** HTTPS URL of the token logo. Pass null to clear. */
  @ApiPropertyOptional({
    example: 'https://cdn.example.com/tokens/usdt.png',
    nullable: true,
    description: 'HTTPS URL of the token logo. Pass null to clear.',
  })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https'] })
  public logoUrl?: string | null;

  /** Optional operator description. Pass null to clear. */
  @ApiPropertyOptional({
    example: 'Tether USD ERC-20 token on Ethereum mainnet.',
    nullable: true,
    description: 'Operator description. Pass null to clear.',
  })
  @IsOptional()
  @IsString()
  public description?: string | null;
}
