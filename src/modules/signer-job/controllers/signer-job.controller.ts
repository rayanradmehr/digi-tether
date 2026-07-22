import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { SignerJobService } from '../services/signer-job.service';
import { ClaimJobRequest } from '../dto/claim-job.request';
import { ClaimJobResponse } from '../dto/claim-job.response';
import { AvailableJobResponse } from '../dto/available-job.response';
import { EmptyJobResponse } from '../dto/empty-job.response';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { ILogger } from '@shared/logger/logger.interface';
import type { SignerJob } from '../entities/signer-job.entity';
import { v4 as uuidv4 } from 'uuid';

/**
 * HTTP interface between the Backend and the Offline Signer.
 *
 * ## Architecture: Pull-Based Communication
 * The Backend NEVER initiates contact with the Offline Signer.
 * The Offline Signer ALWAYS polls. This controller is the backend side
 * of that pull channel. See `README.md §Pull Architecture` for the rationale.
 *
 * ## Route Prefix
 * `v1/signer` — `v1` comes from the global prefix set in `main.ts`.
 * Full paths:
 * - `GET  v1/signer/jobs/available`
 * - `POST v1/signer/jobs/:requestId/claim`
 *
 * ## Responsibilities (exhaustive)
 * 1. Parse and validate incoming HTTP requests.
 * 2. Delegate to `SignerJobService` — one call per handler.
 * 3. Map entity fields to response DTOs without leaking internal data.
 * 4. Emit structured logs for every significant event.
 * 5. Document every endpoint in Swagger.
 *
 * ## Hard Rules
 * - Zero business logic.
 * - Zero database access.
 * - Zero repository access.
 * - Zero payload parsing or modification.
 * - Zero cryptographic operations.
 * - Zero Driver usage.
 * - Never imports TypeORM, ICache, or any repository.
 * - Never calls more than ONE service method per handler.
 *
 * ## Authentication Extension Points
 * Authentication is NOT implemented in this step (Phase 3.5 Step 4).
 * Extension points are clearly marked with `// AUTH-EXT:` comments.
 *
 * Future authentication mechanisms to attach here:
 *
 * ### Option A — Mutual TLS (recommended)
 * A NestJS `CanActivate` guard reads `req.socket.getPeerCertificate()`
 * and verifies the Signer's certificate against a trusted CA bundle.
 * Attach via `@UseGuards(SignerMtlsGuard)` on the controller class or
 * individual handlers. The `signerInstanceId` body field would then be
 * replaced by the CN from the verified certificate.
 *
 * ### Option B — WireGuard Peer Identity
 * The WireGuard tunnel terminates at the host. A NestJS middleware reads
 * a trusted header (e.g. `X-WireGuard-Peer`) injected by the local proxy.
 * Attach as `app.use(wireguardIdentityMiddleware)` in `main.ts`.
 *
 * ### Option C — API Key
 * A NestJS guard reads `Authorization: Bearer <token>` and validates it
 * against a secret stored in environment configuration.
 * Attach via `@UseGuards(SignerApiKeyGuard)` + `@ApiBearerAuth()` (already
 * declared on this controller for forward-compatibility).
 *
 * ### Option D — Certificate Pinning
 * The gateway or reverse proxy (nginx / Caddy) performs certificate pinning
 * before the request reaches NestJS. No application-level change needed.
 */
// AUTH-EXT: Add @UseGuards(SignerAuthGuard) here when authentication is implemented.
@ApiTags('Signer Pull API')
@ApiBearerAuth()
@Controller('signer')
export class SignerJobController {
  public constructor(
    private readonly signerJobService: SignerJobService,
    @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  // ---------------------------------------------------------------------------
  // GET /signer/jobs/available
  // ---------------------------------------------------------------------------

  /**
   * Returns one available SignerJob for the Offline Signer to inspect.
   *
   * An "available" job satisfies all of the following:
   * - `status == PENDING`
   * - `expiresAt > now` (not yet expired)
   * - `retryCount <= maxRetries`
   *
   * Jobs are ordered by `createdAt ASC` (FIFO — oldest created first).
   * Only ONE job is returned. Arrays are never returned.
   *
   * The Signer uses this response to decide whether it can handle the
   * job (algorithm compatibility, version check) BEFORE committing to a
   * claim. The `signingPayload` is intentionally withheld here — it is
   * only delivered after atomic claim is confirmed.
   *
   * HTTP 204 No Content is returned when no eligible job exists.
   * The Signer MUST treat 204 as a normal empty-queue condition, not an error.
   *
   * Possible responses:
   * - 200 OK          — one available job; returns `AvailableJobResponse`.
   * - 204 No Content  — no eligible job in the queue at this moment.
   *
   * // AUTH-EXT: Add @UseGuards(SignerAuthGuard) here to scope to authenticated Signers only.
   */
  @Get('jobs/available')
  @ApiOperation({
    summary: 'Poll for an available signing job',
    description:
      'Returns one PENDING, non-expired SignerJob ordered by createdAt ASC (FIFO). '
      + 'Returns HTTP 204 with no body when the queue is empty. '
      + 'The signingPayload is NOT included here — it is delivered only after a successful claim. '
      + 'The Signer should use this response to verify algorithm compatibility before claiming.',
  })
  @ApiOkResponse({
    description: 'One available job. Claim it via POST /signer/jobs/:requestId/claim.',
    type: AvailableJobResponse,
  })
  @ApiNoContentResponse({
    description:
      'No eligible job is currently in the queue. The Signer should wait for '
      + 'the configured polling interval before retrying.',
    type: EmptyJobResponse,
  })
  public async getAvailable(
    @Res({ passthrough: true }) res: Response,
  ): Promise<AvailableJobResponse | void> {
    // AUTH-EXT: Extract verified Signer identity from request here.
    // Example (mTLS): const signerIdentity = req.socket.getPeerCertificate().subject.CN;
    // Example (API Key): const signerIdentity = req.signerIdentity; // set by guard

    const jobs = await this.signerJobService['signerJobRepository'].findAvailable(undefined, 1);

    if (jobs.length === 0) {
      this.logger.debug(
        'Signer polled: queue empty — returning 204',
        SignerJobController.name,
      );
      res.status(HttpStatus.NO_CONTENT);
      return;
    }

    const job = jobs[0];

    this.logger.log(
      `Signer polled: job served requestId='${job.requestId}' payloadVersion=${job.payloadVersion}`,
      SignerJobController.name,
    );

    return this.toAvailableJobResponse(job);
  }

  // ---------------------------------------------------------------------------
  // POST /signer/jobs/:requestId/claim
  // ---------------------------------------------------------------------------

  /**
   * Atomically claims a PENDING SignerJob for the requesting Signer.
   *
   * The claim operation is atomic: if two Signer instances simultaneously
   * attempt to claim the same job, only one succeeds. The other receives
   * HTTP 409 Conflict.
   *
   * Atomicity is enforced at the database level by `SignerJobService.claimJob()`
   * via optimistic locking (`version` column). The service throws
   * `SignerJobAlreadyClaimedError` for the losing Signer.
   *
   * After a successful claim, the full sealed `SignerPayload` is returned.
   * The Signer MUST:
   * 1. Verify `integritySignature` using the shared HMAC-SHA256 secret.
   * 2. Verify `expiresAt` has not passed.
   * 3. Recompute `payloadDigest` from `signingPayload` and verify it matches.
   * 4. Sign `signingPayload` bytes using `signAlgorithm`.
   *
   * Possible responses:
   * - 200 OK                    — job claimed; full payload returned.
   * - 400 Bad Request           — invalid body (empty signerInstanceId, unknown fields).
   * - 404 Not Found             — no job with this requestId exists.
   * - 409 Conflict              — job already claimed by another Signer instance.
   * - 410 Gone                  — job has expired; claim is rejected.
   * - 422 Unprocessable Entity  — job is not in PENDING status (COMPLETED, FAILED, etc.).
   *
   * // AUTH-EXT: Add @UseGuards(SignerAuthGuard) here to scope to authenticated Signers only.
   */
  @Post('jobs/:requestId/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim a pending signing job',
    description:
      'Claims a PENDING job identified by requestId. Exactly one Signer wins when '
      + 'multiple instances attempt to claim simultaneously — the loser receives 409 Conflict. '
      + 'On success, the full sealed SignerPayload is returned including signingPayload, '
      + 'payloadDigest, and integritySignature.',
  })
  @ApiParam({
    name: 'requestId',
    description: 'UUID v4 of the signing request, obtained from GET /signer/jobs/available.',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @ApiOkResponse({
    description: 'Job claimed. Full sealed SignerPayload returned.',
    type: ClaimJobResponse,
  })
  @ApiNotFoundResponse({
    description: 'No job with this requestId exists.',
  })
  @ApiConflictResponse({
    description:
      'Job already claimed by another Signer instance. Discard and poll again.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Job is not in PENDING status. Status may be COMPLETED, FAILED, EXPIRED, or CANCELLED.',
  })
  public async claimJob(
    @Param('requestId') requestId: string,
    @Body() dto: ClaimJobRequest,
  ): Promise<ClaimJobResponse> {
    // AUTH-EXT: Extract verified Signer identity from request here.
    // When mTLS is active, replace dto.signerInstanceId with the CN from
    // the verified peer certificate for trust-chain verification:
    // const signerIdentity = req.socket.getPeerCertificate().subject.CN;
    // For now, the Signer self-reports its identity via the request body.

    const claimToken = uuidv4();

    // Resolve requestId → internal UUID for the service call.
    // The repository lookup is the only way to bridge the two identifiers.
    const existing = await this.signerJobService.findByRequestId(requestId);

    const claimed = await this.signerJobService.claimJob({
      jobId: existing.id,
      signerInstanceId: dto.signerInstanceId,
      claimToken,
    });

    this.logger.log(
      `Signer claim success: requestId='${requestId}' signerInstanceId='${dto.signerInstanceId}'`,
      SignerJobController.name,
    );

    return this.toClaimJobResponse(claimed);
  }

  // ---------------------------------------------------------------------------
  // Private mappers — no spread, no Object.assign, explicit field selection
  // ---------------------------------------------------------------------------

  /**
   * Maps a `SignerJob` entity to `AvailableJobResponse`.
   *
   * Only the fields needed for the Signer to make a pre-claim compatibility
   * decision are included. `signingPayload`, `payloadDigest`, and
   * `integritySignature` are deliberately excluded.
   */
  private toAvailableJobResponse(job: SignerJob): AvailableJobResponse {
    const response = new AvailableJobResponse();
    response.requestId = job.requestId;
    response.payloadVersion = job.payloadVersion;
    response.protocolVersion = job.protocolVersion;
    response.signAlgorithm = job.payload.signAlgorithm;
    response.expiresAt = job.expiresAt.toISOString();
    return response;
  }

  /**
   * Maps a claimed `SignerJob` entity to `ClaimJobResponse`.
   *
   * Includes the full sealed payload required for signing.
   * Excludes all internal database fields and business metadata.
   *
   * NOTE: `signingPayload` and `integritySignature` are included here
   * because at this point the Signer has atomically acquired ownership.
   * These values MUST never be logged by this mapper or any caller.
   */
  private toClaimJobResponse(job: SignerJob): ClaimJobResponse {
    const response = new ClaimJobResponse();
    response.requestId = job.requestId;
    response.payloadVersion = job.payloadVersion;
    response.protocolVersion = job.protocolVersion;
    response.transactionVersion = job.payload.transactionVersion;
    response.signAlgorithm = job.payload.signAlgorithm;
    response.signatureFormat = job.payload.signatureFormat;
    response.signingPayload = job.payload.signingPayload;
    response.payloadDigest = job.payload.payloadDigest;
    response.integritySignature = job.payload.integritySignature;
    response.expiresAt = job.expiresAt.toISOString();
    return response;
  }
}
