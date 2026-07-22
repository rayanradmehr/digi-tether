import { ApiProperty } from '@nestjs/swagger';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';

/**
 * Response DTO for the `GET /signer/jobs/available` endpoint.
 *
 * Contains ONLY the fields the Offline Signer needs to perform its work.
 *
 * Exclusion guarantees (enforced by explicit mapping — no spread):
 * - No database primary key (`id`).
 * - No internal wallet UUID beyond what the payload already carries.
 * - No network metadata beyond what is in the sealed payload.
 * - No `claimedBy`, `claimedAt`, `claimToken`, `createdAt`, `updatedAt`.
 * - No `signingPayload` — that MUST only be returned after the job is
 *   claimed, so the Signer cannot sign without atomic ownership.
 * - No `integritySignature` — returned only in `ClaimJobResponse`.
 *
 * The Signer uses this response to decide whether it can handle the job
 * (e.g. algorithm compatibility, version check) before committing to a claim.
 */
export class AvailableJobResponse {
  /**
   * UUID v4 that uniquely identifies this signing request.
   * The Signer passes this as the `:requestId` path parameter in the
   * subsequent `POST /signer/jobs/:requestId/claim` call.
   */
  @ApiProperty({
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
    description:
      'UUID of the signing request. Use this as the :requestId path parameter '
      + 'in the claim endpoint.',
  })
  public requestId!: string;

  /**
   * Schema version of the `SignerPayload` structure.
   * The Signer MUST reject versions it does not understand.
   */
  @ApiProperty({
    example: 1,
    description:
      'Schema version of the SignerPayload. Reject if this version is not supported.',
  })
  public payloadVersion!: number;

  /**
   * Backend–Signer communication protocol version.
   * Governs transport-level semantics independent of the payload schema.
   */
  @ApiProperty({
    example: 1,
    description: 'Backend–Signer protocol version. Independent of payloadVersion.',
  })
  public protocolVersion!: number;

  /**
   * Signing algorithm the Signer must use for this job.
   * Advertised here so the Signer can skip jobs for algorithms it does
   * not support before committing to a claim.
   */
  @ApiProperty({
    enum: SignAlgorithm,
    example: SignAlgorithm.ECDSA_SECP256K1,
    description:
      'Cryptographic signing algorithm required for this job. '
      + 'Reject if the algorithm is not supported by this Signer instance.',
  })
  public signAlgorithm!: SignAlgorithm;

  /**
   * ISO 8601 UTC deadline for this job.
   * The Signer MUST reject jobs where `expiresAt` has already passed.
   * Although the backend filters expired jobs from this endpoint, the
   * Signer performs its own independent verification.
   */
  @ApiProperty({
    example: '2026-07-22T21:00:00.000Z',
    description:
      'ISO 8601 UTC expiry timestamp. The Signer must independently verify '
      + 'this has not passed before proceeding.',
  })
  public expiresAt!: string;
}
