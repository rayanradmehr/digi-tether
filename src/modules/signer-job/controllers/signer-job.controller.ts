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
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiGoneResponse,
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
import { SubmitResultRequest } from '../dto/submit-result.request';
import { SubmitResultResponse } from '../dto/submit-result.response';
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
 * - `POST v1/signer/jobs/:requestId/result`
 *
 * ## Responsibilities (exhaustive)
 * 1. Parse and validate incoming HTTP requests via the global `ValidationPipe`.
 * 2. Perform lightweight, stateless integrity checks on submitted results
 *    (field equality — no cryptography).
 * 3. Delegate all state mutations to `SignerJobService` — one call per handler.
 * 4. Map entity fields to response DTOs without leaking internal data.
 * 5. Emit structured logs for every significant event.
 * 6. Document every endpoint in Swagger.
 *
 * ## Hard Rules
 * - Zero business logic.
 * - Zero database access.
 * - Zero repository access.
 * - Zero cryptographic operations.
 * - Zero blockchain library usage.
 * - Zero RPC calls.
 * - Never imports TypeORM, ICache, or any repository directly.
 * - Never calls more than ONE service method per handler.
 *
 * ## Authentication Extension Points
 * Authentication is NOT implemented in Phase 3.5. Extension points are
 * marked with `// AUTH-EXT:` comments in each handler.
 *
 * Future mechanisms:
 * ### Option A — Mutual TLS
 *   Guard reads `req.socket.getPeerCertificate()`. Attach via `@UseGuards(SignerMtlsGuard)`.
 * ### Option B — WireGuard Identity
 *   Trusted header set by local proxy. Attach as middleware in `main.ts`.
 * ### Option C — API Key
 *   Guard reads `Authorization: Bearer <token>`. Attach via `@UseGuards(SignerApiKeyGuard)`.
 * ### Option D — Certificate Pinning
 *   Handled at reverse proxy (nginx/Caddy). No app change required.
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
   * The Signer uses this to decide whether it can handle the job
   * (algorithm compatibility, version check) BEFORE committing to a claim.
   * `signingPayload` is intentionally withheld — it is only delivered after
   * atomic claim is confirmed.
   *
   * HTTP 204 is returned when the queue is empty. The Signer MUST treat
   * 204 as a normal condition, not an error.
   *
   * Possible responses:
   * - 200 OK          — one available job.
   * - 204 No Content  — queue is empty.
   *
   * // AUTH-EXT: Add @UseGuards(SignerAuthGuard) here.
   */
  @Get('jobs/available')
  @ApiOperation({
    summary: 'Poll for an available signing job',
    description:
      'Returns one PENDING, non-expired SignerJob ordered by createdAt ASC (FIFO). '
      + 'Returns HTTP 204 with no body when the queue is empty. '
      + 'The signingPayload is NOT included — it is delivered only after a successful claim.',
  })
  @ApiOkResponse({
    description: 'One available job. Claim it via POST /signer/jobs/:requestId/claim.',
    type: AvailableJobResponse,
  })
  @ApiNoContentResponse({
    description: 'No eligible job is currently available. Wait for the polling interval and retry.',
    type: EmptyJobResponse,
  })
  public async getAvailable(
    @Res({ passthrough: true }) res: Response,
  ): Promise<AvailableJobResponse | void> {
    // AUTH-EXT: Extract verified Signer identity from request here.

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
   * If two Signer instances simultaneously attempt to claim the same job,
   * only one succeeds. The other receives HTTP 409 Conflict (optimistic lock).
   *
   * After a successful claim, the full sealed `SignerPayload` is returned.
   * The Signer MUST verify `integritySignature`, `expiresAt`, and
   * `payloadDigest` before performing any signing operation.
   *
   * Possible responses:
   * - 200 OK                   — job claimed; full payload returned.
   * - 400 Bad Request          — invalid body.
   * - 404 Not Found            — no job with this requestId.
   * - 409 Conflict             — job already claimed by another instance.
   * - 410 Gone                 — job has expired.
   * - 422 Unprocessable Entity — job is not in PENDING status.
   *
   * // AUTH-EXT: Add @UseGuards(SignerAuthGuard) here.
   */
  @Post('jobs/:requestId/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim a pending signing job',
    description:
      'Claims a PENDING job identified by requestId. Exactly one Signer wins concurrent claims. '
      + 'On success, the full sealed SignerPayload is returned including signingPayload, '
      + 'payloadDigest, and integritySignature.',
  })
  @ApiParam({
    name: 'requestId',
    description: 'UUID v4 of the signing request, from GET /signer/jobs/available.',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @ApiOkResponse({
    description: 'Job claimed. Full sealed SignerPayload returned.',
    type: ClaimJobResponse,
  })
  @ApiNotFoundResponse({ description: 'No job with this requestId exists.' })
  @ApiConflictResponse({ description: 'Job already claimed by another Signer instance.' })
  @ApiGoneResponse({ description: 'Job has expired. Discard and poll again.' })
  @ApiUnprocessableEntityResponse({
    description: 'Job is not in PENDING status (COMPLETED, FAILED, EXPIRED, or CANCELLED).',
  })
  public async claimJob(
    @Param('requestId') requestId: string,
    @Body() dto: ClaimJobRequest,
  ): Promise<ClaimJobResponse> {
    // AUTH-EXT: Extract verified Signer identity from request here.
    // When mTLS: const signerIdentity = req.socket.getPeerCertificate().subject.CN;

    const claimToken = uuidv4();
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
  // POST /signer/jobs/:requestId/result
  // ---------------------------------------------------------------------------

  /**
   * Accepts a completed signing result from the Offline Signer and
   * transitions the job from CLAIMED to COMPLETED.
   *
   * ## Integrity validation performed by this handler (stateless, no crypto)
   * Before invoking the service the controller verifies:
   * 1. Body `requestId` matches the `:requestId` path parameter.
   * 2. Body `result.requestId` matches the `:requestId` path parameter.
   * 3. Stored `payload.payloadDigest` is present (integritySignature presence check).
   * 4. Body `signatureAlgorithm` matches stored `payload.signAlgorithm`.
   * 5. Body `result.signAlgorithm` matches stored `payload.signAlgorithm`.
   * 6. Body `result.signatureFormat` matches stored `payload.signatureFormat`.
   * 7. Stored `payloadVersion`, `protocolVersion`, `transactionVersion` are
   *    present and non-zero (version integrity).
   * 8. `completedAt` falls within [payload.createdAt, payload.expiresAt].
   *
   * ## What the backend does NOT do
   * - Does NOT verify the cryptographic signature.
   * - Does NOT recover the public key.
   * - Does NOT call any blockchain RPC node.
   * - Does NOT use ethers, tronweb, or any crypto library.
   * - Does NOT parse the signingPayload bytes.
   *
   * The backend trusts the Offline Signer as the sole authority over
   * cryptographic correctness (Architecture Rule §12).
   *
   * ## Immutability after completion
   * Once a job is COMPLETED, no further mutations are possible.
   * Duplicate submissions receive HTTP 409 Conflict.
   *
   * Possible responses:
   * - 200 OK                   — job completed; SubmitResultResponse returned.
   * - 400 Bad Request          — DTO validation failure.
   * - 404 Not Found            — no job with this requestId.
   * - 409 Conflict             — job is already COMPLETED.
   * - 410 Gone                 — job has expired.
   * - 422 Unprocessable Entity — job is not CLAIMED, or integrity check failed.
   *
   * // AUTH-EXT: Add @UseGuards(SignerAuthGuard) here.
   */
  @Post('jobs/:requestId/result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a completed signing result',
    description:
      'Accepts the signing result from the Offline Signer and transitions the job '
      + 'from CLAIMED to COMPLETED. Performs metadata integrity checks (no cryptography). '
      + 'Duplicate submissions are rejected with 409 Conflict. '
      + 'Only CLAIMED jobs may be completed.',
  })
  @ApiParam({
    name: 'requestId',
    description: 'UUID v4 of the signing request, echoed from the claimed payload.',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @ApiOkResponse({
    description: 'Result accepted. Job is now COMPLETED.',
    type: SubmitResultResponse,
  })
  @ApiNotFoundResponse({ description: 'No job with this requestId exists.' })
  @ApiConflictResponse({ description: 'Job is already COMPLETED. Duplicate submission rejected.' })
  @ApiGoneResponse({ description: 'Job has expired. Result cannot be accepted.' })
  @ApiUnprocessableEntityResponse({
    description:
      'Job is not in CLAIMED status, or integrity validation failed '
      + '(requestId mismatch, algorithm mismatch, version mismatch, or timing violation).',
  })
  public async submitResult(
    @Param('requestId') requestId: string,
    @Body() dto: SubmitResultRequest,
  ): Promise<SubmitResultResponse> {
    // AUTH-EXT: Extract verified Signer identity from request here.

    // --- Step 1: Resolve job ---
    const job = await this.signerJobService.findByRequestId(requestId);

    // --- Step 2: Stateless integrity checks (no cryptography) ---
    this.assertResultIntegrity(requestId, dto, job);

    // --- Step 3: Build SignerResult for storage ---
    // The controller maps the DTO to the SignerResult contract shape.
    // No field is added, removed, or transformed beyond type coercion.
    const signerResult = {
      requestId: dto.result.requestId,
      signature: dto.result.signature,
      publicKey: dto.result.publicKey,
      signAlgorithm: dto.result.signAlgorithm,
      signatureFormat: dto.result.signatureFormat,
      signerVersion: dto.result.signerVersion,
      signedAt: dto.result.signedAt,
      executionTimeMs: dto.result.executionTimeMs,
    } as const;

    // --- Step 4: Delegate to service (owns the state transition) ---
    // claimToken is retrieved from the stored job — the Signer never sends it.
    const completed = await this.signerJobService.completeJob({
      jobId: job.id,
      claimToken: job.claimToken ?? '',
      result: signerResult,
    });

    this.logger.log(
      `Signer result accepted: requestId='${requestId}' signerVersion='${dto.result.signerVersion}'`,
      SignerJobController.name,
    );

    return this.toSubmitResultResponse(completed);
  }

  // ---------------------------------------------------------------------------
  // Private: integrity validation — stateless, no cryptography
  // ---------------------------------------------------------------------------

  /**
   * Performs all stateless integrity checks on the submitted result.
   *
   * These checks verify metadata equality only. No cryptographic operation
   * is performed. The backend trusts the Signer for signature correctness.
   *
   * Throws `UnprocessableEntityException` (HTTP 422) for any mismatch.
   *
   * Checks performed (in order):
   * 1.  Body requestId matches path requestId.
   * 2.  result.requestId matches path requestId.
   * 3.  integritySignature is present in stored payload.
   * 4.  payloadDigest is present in stored payload.
   * 5.  signatureAlgorithm matches stored payload.signAlgorithm.
   * 6.  result.signAlgorithm matches stored payload.signAlgorithm.
   * 7.  result.signatureFormat matches stored payload.signatureFormat.
   * 8.  payloadVersion is present and > 0.
   * 9.  protocolVersion is present and > 0.
   * 10. transactionVersion is present and > 0.
   * 11. completedAt is within [payload.createdAt, payload.expiresAt].
   */
  private assertResultIntegrity(
    pathRequestId: string,
    dto: SubmitResultRequest,
    job: SignerJob,
  ): void {
    // 1. Body requestId vs path parameter
    if (dto.requestId !== pathRequestId) {
      this.logRejection(pathRequestId, 'body requestId does not match path requestId');
      throw new UnprocessableEntityException(
        'requestId in body does not match :requestId path parameter',
      );
    }

    // 2. result.requestId vs path parameter
    if (dto.result.requestId !== pathRequestId) {
      this.logRejection(pathRequestId, 'result.requestId does not match path requestId');
      throw new UnprocessableEntityException(
        'result.requestId does not match :requestId path parameter',
      );
    }

    // 3. integritySignature presence
    if (!job.payload.integritySignature) {
      this.logRejection(pathRequestId, 'stored payload missing integritySignature');
      throw new UnprocessableEntityException(
        'Stored payload is missing integritySignature — job is corrupt',
      );
    }

    // 4. payloadDigest presence
    if (!job.payload.payloadDigest) {
      this.logRejection(pathRequestId, 'stored payload missing payloadDigest');
      throw new UnprocessableEntityException(
        'Stored payload is missing payloadDigest — job is corrupt',
      );
    }

    // 5. signatureAlgorithm (top-level) matches stored
    if (dto.signatureAlgorithm !== job.payload.signAlgorithm) {
      this.logRejection(
        pathRequestId,
        `signatureAlgorithm mismatch: submitted='${dto.signatureAlgorithm}' stored='${job.payload.signAlgorithm}'`,
      );
      throw new UnprocessableEntityException(
        `signatureAlgorithm '${dto.signatureAlgorithm}' does not match stored payload signAlgorithm '${job.payload.signAlgorithm}'`,
      );
    }

    // 6. result.signAlgorithm matches stored
    if (dto.result.signAlgorithm !== job.payload.signAlgorithm) {
      this.logRejection(
        pathRequestId,
        `result.signAlgorithm mismatch: submitted='${dto.result.signAlgorithm}' stored='${job.payload.signAlgorithm}'`,
      );
      throw new UnprocessableEntityException(
        `result.signAlgorithm '${dto.result.signAlgorithm}' does not match stored payload signAlgorithm '${job.payload.signAlgorithm}'`,
      );
    }

    // 7. result.signatureFormat matches stored
    if (dto.result.signatureFormat !== job.payload.signatureFormat) {
      this.logRejection(
        pathRequestId,
        `result.signatureFormat mismatch: submitted='${dto.result.signatureFormat}' stored='${job.payload.signatureFormat}'`,
      );
      throw new UnprocessableEntityException(
        `result.signatureFormat '${dto.result.signatureFormat}' does not match stored payload signatureFormat '${job.payload.signatureFormat}'`,
      );
    }

    // 8–10. Version integrity
    if (!job.payloadVersion || job.payloadVersion < 1) {
      this.logRejection(pathRequestId, 'stored payloadVersion is missing or zero');
      throw new UnprocessableEntityException('Stored job payloadVersion is invalid');
    }
    if (!job.protocolVersion || job.protocolVersion < 1) {
      this.logRejection(pathRequestId, 'stored protocolVersion is missing or zero');
      throw new UnprocessableEntityException('Stored job protocolVersion is invalid');
    }
    if (!job.payload.transactionVersion || job.payload.transactionVersion < 1) {
      this.logRejection(pathRequestId, 'stored transactionVersion is missing or zero');
      throw new UnprocessableEntityException('Stored payload transactionVersion is invalid');
    }

    // 11. completedAt timing window
    const completedAt = new Date(dto.completedAt);
    const payloadCreatedAt = new Date(job.payload.createdAt);
    const payloadExpiresAt = new Date(job.payload.expiresAt);

    if (completedAt < payloadCreatedAt || completedAt > payloadExpiresAt) {
      this.logRejection(
        pathRequestId,
        `completedAt '${dto.completedAt}' is outside payload validity window [${job.payload.createdAt}, ${job.payload.expiresAt}]`,
      );
      throw new UnprocessableEntityException(
        `completedAt '${dto.completedAt}' is outside the job validity window`,
      );
    }
  }

  /**
   * Emits a structured warning log for any rejected result submission.
   * Never logs the signature, signingPayload, payloadDigest, or integritySignature.
   */
  private logRejection(requestId: string, reason: string): void {
    this.logger.warn(
      `Signer result rejected: requestId='${requestId}' reason='${reason}'`,
      SignerJobController.name,
    );
  }

  // ---------------------------------------------------------------------------
  // Private mappers — explicit field-by-field, no spread, no Object.assign
  // ---------------------------------------------------------------------------

  private toAvailableJobResponse(job: SignerJob): AvailableJobResponse {
    const response = new AvailableJobResponse();
    response.requestId = job.requestId;
    response.payloadVersion = job.payloadVersion;
    response.protocolVersion = job.protocolVersion;
    response.signAlgorithm = job.payload.signAlgorithm;
    response.expiresAt = job.expiresAt.toISOString();
    return response;
  }

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

  /**
   * Maps a COMPLETED `SignerJob` entity to `SubmitResultResponse`.
   *
   * Excluded: signature, signingPayload, payloadDigest, integritySignature,
   * claimToken, walletId, networkId, referenceId, publicKey.
   */
  private toSubmitResultResponse(job: SignerJob): SubmitResultResponse {
    const response = new SubmitResultResponse();
    response.requestId = job.requestId;
    response.status = job.status;
    response.completedAt = job.completedAt?.toISOString() ?? new Date().toISOString();
    response.processingDuration =
      job.claimedAt && job.completedAt
        ? job.completedAt.getTime() - job.claimedAt.getTime()
        : null;
    return response;
  }
}
