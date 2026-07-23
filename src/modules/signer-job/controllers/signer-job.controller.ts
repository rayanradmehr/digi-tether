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

@ApiTags('Signer Pull API')
@ApiBearerAuth()
@Controller('signer')
export class SignerJobController {
  public constructor(
    private readonly signerJobService: SignerJobService,
    @Inject(INJECTION_TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  @Get('jobs/available')
  @ApiOperation({
    summary: 'Poll for an available signing job',
    description:
      'Returns one PENDING, non-expired SignerJob ordered by createdAt ASC (FIFO). '
      + 'Returns HTTP 204 with no body when the queue is empty. '
      + 'The signingPayload is NOT included — it is delivered only after a successful claim.',
  })
  @ApiOkResponse({ description: 'One available job.', type: AvailableJobResponse })
  @ApiNoContentResponse({ description: 'No eligible job is currently available.', type: EmptyJobResponse })
  public async getAvailable(
    @Res({ passthrough: true }) res: Response,
  ): Promise<AvailableJobResponse | void> {
    const jobs = await this.signerJobService['signerJobRepository'].findAvailable(undefined, 1);

    if (jobs.length === 0) {
      this.logger.debug(
        'Signer polled: queue empty — returning 204',
        SignerJobController.name,
      );
      res.status(HttpStatus.NO_CONTENT);
      return;
    }

    const job = jobs[0] as SignerJob;

    this.logger.log(
      `Signer polled: job served requestId='${job.requestId}' payloadVersion=${job.payloadVersion}`,
      SignerJobController.name,
    );

    return this.toAvailableJobResponse(job);
  }

  @Post('jobs/:requestId/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim a pending signing job',
    description:
      'Claims a PENDING job identified by requestId. Exactly one Signer wins concurrent claims. '
      + 'On success, the full sealed SignerPayload is returned.',
  })
  @ApiParam({ name: 'requestId', description: 'UUID v4 of the signing request.' })
  @ApiOkResponse({ description: 'Job claimed.', type: ClaimJobResponse })
  @ApiNotFoundResponse({ description: 'No job with this requestId exists.' })
  @ApiConflictResponse({ description: 'Job already claimed by another Signer instance.' })
  @ApiGoneResponse({ description: 'Job has expired.' })
  @ApiUnprocessableEntityResponse({ description: 'Job is not in PENDING status.' })
  public async claimJob(
    @Param('requestId') requestId: string,
    @Body() dto: ClaimJobRequest,
  ): Promise<ClaimJobResponse> {
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

  @Post('jobs/:requestId/result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a completed signing result',
    description:
      'Accepts the signing result from the Offline Signer and transitions the job '
      + 'from CLAIMED to COMPLETED.',
  })
  @ApiParam({ name: 'requestId', description: 'UUID v4 of the signing request.' })
  @ApiOkResponse({ description: 'Result accepted. Job is now COMPLETED.', type: SubmitResultResponse })
  @ApiNotFoundResponse({ description: 'No job with this requestId exists.' })
  @ApiConflictResponse({ description: 'Job is already COMPLETED.' })
  @ApiGoneResponse({ description: 'Job has expired.' })
  @ApiUnprocessableEntityResponse({ description: 'Job is not in CLAIMED status, or integrity validation failed.' })
  public async submitResult(
    @Param('requestId') requestId: string,
    @Body() dto: SubmitResultRequest,
  ): Promise<SubmitResultResponse> {
    const job = await this.signerJobService.findByRequestId(requestId);

    this.assertResultIntegrity(requestId, dto, job);

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
  // Private: integrity validation
  // ---------------------------------------------------------------------------

  private assertResultIntegrity(
    pathRequestId: string,
    dto: SubmitResultRequest,
    job: SignerJob,
  ): void {
    if (dto.requestId !== pathRequestId) {
      this.logRejection(pathRequestId, 'body requestId does not match path requestId');
      throw new UnprocessableEntityException(
        'requestId in body does not match :requestId path parameter',
      );
    }

    if (dto.result.requestId !== pathRequestId) {
      this.logRejection(pathRequestId, 'result.requestId does not match path requestId');
      throw new UnprocessableEntityException(
        'result.requestId does not match :requestId path parameter',
      );
    }

    if (!job.payload.integritySignature) {
      this.logRejection(pathRequestId, 'stored payload missing integritySignature');
      throw new UnprocessableEntityException(
        'Stored payload is missing integritySignature — job is corrupt',
      );
    }

    if (!job.payload.payloadDigest) {
      this.logRejection(pathRequestId, 'stored payload missing payloadDigest');
      throw new UnprocessableEntityException(
        'Stored payload is missing payloadDigest — job is corrupt',
      );
    }

    if (dto.signatureAlgorithm !== job.payload.signAlgorithm) {
      this.logRejection(
        pathRequestId,
        `signatureAlgorithm mismatch: submitted='${dto.signatureAlgorithm}' stored='${job.payload.signAlgorithm}'`,
      );
      throw new UnprocessableEntityException(
        `signatureAlgorithm '${dto.signatureAlgorithm}' does not match stored payload signAlgorithm '${job.payload.signAlgorithm}'`,
      );
    }

    if (dto.result.signAlgorithm !== job.payload.signAlgorithm) {
      this.logRejection(
        pathRequestId,
        `result.signAlgorithm mismatch: submitted='${dto.result.signAlgorithm}' stored='${job.payload.signAlgorithm}'`,
      );
      throw new UnprocessableEntityException(
        `result.signAlgorithm '${dto.result.signAlgorithm}' does not match stored payload signAlgorithm '${job.payload.signAlgorithm}'`,
      );
    }

    if (dto.result.signatureFormat !== job.payload.signatureFormat) {
      this.logRejection(
        pathRequestId,
        `result.signatureFormat mismatch: submitted='${dto.result.signatureFormat}' stored='${job.payload.signatureFormat}'`,
      );
      throw new UnprocessableEntityException(
        `result.signatureFormat '${dto.result.signatureFormat}' does not match stored payload signatureFormat '${job.payload.signatureFormat}'`,
      );
    }

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

    const completedAt = new Date(dto.completedAt);
    const payloadCreatedAt = new Date(job.payload.createdAt);
    const payloadExpiresAt = new Date(job.payload.expiresAt);

    if (completedAt < payloadCreatedAt || completedAt > payloadExpiresAt) {
      this.logRejection(
        pathRequestId,
        `completedAt '${dto.completedAt}' is outside payload validity window`,
      );
      throw new UnprocessableEntityException(
        `completedAt '${dto.completedAt}' is outside the job validity window`,
      );
    }
  }

  private logRejection(requestId: string, reason: string): void {
    this.logger.warn(
      `Signer result rejected: requestId='${requestId}' reason='${reason}'`,
      SignerJobController.name,
    );
  }

  // ---------------------------------------------------------------------------
  // Private mappers
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
