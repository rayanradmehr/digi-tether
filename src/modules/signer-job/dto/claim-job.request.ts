import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for `POST /signer/jobs/:requestId/claim`.
 *
 * The global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform)
 * validates this DTO before the handler is invoked.
 *
 * Unknown fields are rejected by `forbidNonWhitelisted`.
 * Empty `signerInstanceId` is rejected by `@IsNotEmpty()`.
 *
 * ## Extension Point — Authentication (Future Step)
 * When Mutual TLS or WireGuard identity authentication is added, the
 * Signer's identity will be extracted from the verified certificate/peer
 * identity at the middleware or guard layer, NOT from this body field.
 * At that point `signerInstanceId` may be deprecated or kept for
 * redundant audit purposes. See `SignerJobController` class doc.
 */
export class ClaimJobRequest {
  /**
   * Stable identifier of the Offline Signer instance making this claim.
   *
   * Format: any non-empty string up to 128 characters.
   * Recommended values: UUID v4, hostname, or a pod/container name that
   * is stable across restarts of the same physical Signer.
   *
   * This value is stored in `signer_jobs.claimed_by` for audit and
   * distributed-claim conflict resolution.
   *
   * SECURITY NOTE: This field is currently self-reported by the Signer.
   * It will be replaced or verified by the mTLS / WireGuard identity
   * extracted at the transport layer in a future authentication step.
   */
  @ApiProperty({
    example: 'signer-instance-01',
    description:
      'Stable identifier of the Signer instance. Used for audit and conflict '
      + 'resolution. Self-reported until mTLS authentication is activated.',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  public signerInstanceId!: string;
}
