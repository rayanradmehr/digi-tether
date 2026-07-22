import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SignerJobController } from '../controllers/signer-job.controller';
import { SignerJobService } from '../services/signer-job.service';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobType } from '../enums/signer-job-type.enum';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignatureFormat } from '../enums/signature-format.enum';
import { SignerJobNotFoundError } from '../errors/signer-job-not-found.error';
import { SignerJobAlreadyClaimedError } from '../errors/signer-job-already-claimed.error';
import { SignerJobCompletedError } from '../errors/signer-job-completed.error';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import { SubmitResultRequest } from '../dto/submit-result.request';
import { ClaimJobRequest } from '../dto/claim-job.request';
import type { SignerJob } from '../entities/signer-job.entity';
import type { SignerPayload } from '../contracts/signer-payload.contract';
import type { Response } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 60_000);
const PAST   = new Date(Date.now() - 60_000);
const REQUEST_ID  = 'rrrrrrrr-0000-0000-0000-000000000001';
const JOB_ID      = 'aaaaaaaa-0000-0000-0000-000000000001';
const CLAIM_TOKEN = 'cccccccc-0000-0000-0000-000000000001';

const makePayload = (overrides: Partial<SignerPayload> = {}): SignerPayload => ({
  payloadVersion: 1,
  protocolVersion: 1,
  transactionVersion: 1,
  requestId: REQUEST_ID,
  walletId: 'wwwwwwww-0000-0000-0000-000000000001',
  network: { chainId: '1', driverKey: 'evm', nativeSymbol: 'ETH' },
  signAlgorithm: SignAlgorithm.ECDSA_SECP256K1,
  signatureFormat: SignatureFormat.RECOVERABLE,
  signingPayload: 'deadbeef',
  payloadDigest: 'cafebabe',
  integritySignature: 'hmac:sha256:aabbcc',
  createdAt: new Date(Date.now() - 1_000).toISOString(),
  expiresAt: FUTURE.toISOString(),
  ...overrides,
});

const makeJob = (overrides: Partial<SignerJob> = {}): SignerJob =>
  ({
    id: JOB_ID,
    requestId: REQUEST_ID,
    walletId: 'wwwwwwww-0000-0000-0000-000000000001',
    networkId: 'nnnnnnnn-0000-0000-0000-000000000001',
    jobType: SignerJobType.WITHDRAW,
    status: SignerJobStatus.PENDING,
    payloadVersion: 1,
    protocolVersion: 1,
    payload: makePayload(),
    expiresAt: FUTURE,
    referenceId: 'ref-uuid',
    referenceType: 'withdrawal',
    claimedBy: null,
    claimedAt: null,
    claimToken: null,
    completedAt: null,
    retryCount: 0,
    result: null,
    errorMessage: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as SignerJob);

const makeSubmitDto = (overrides: Partial<SubmitResultRequest> = {}): SubmitResultRequest => ({
  requestId: REQUEST_ID,
  signature: 'aabbccdd',
  signatureAlgorithm: SignAlgorithm.ECDSA_SECP256K1,
  publicKeyFingerprint: 'sha256:aabbcc',
  completedAt: new Date(Date.now() - 500).toISOString(),
  result: {
    requestId: REQUEST_ID,
    signature: 'aabbccdd',
    publicKey: '02aabbcc',
    signAlgorithm: SignAlgorithm.ECDSA_SECP256K1,
    signatureFormat: SignatureFormat.RECOVERABLE,
    signerVersion: '1.0.0',
    signedAt: new Date(Date.now() - 500).toISOString(),
    executionTimeMs: 42,
  },
  ...overrides,
} as SubmitResultRequest);

const makeRes = (): jest.Mocked<Partial<Response>> => ({ status: jest.fn().mockReturnThis() });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SignerJobController', () => {
  let controller: SignerJobController;
  let service: jest.Mocked<Pick<
    SignerJobService,
    'findByRequestId' | 'claimJob' | 'completeJob'
  >> & { signerJobRepository: { findAvailable: jest.Mock } };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock; verbose: jest.Mock };

  beforeEach(async () => {
    service = {
      findByRequestId: jest.fn(),
      claimJob: jest.fn(),
      completeJob: jest.fn(),
      signerJobRepository: { findAvailable: jest.fn() },
    } as unknown as typeof service;

    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), verbose: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SignerJobController],
      providers: [
        { provide: SignerJobService, useValue: service },
        { provide: INJECTION_TOKENS.LOGGER, useValue: logger },
      ],
    }).compile();

    controller = module.get(SignerJobController);
  });

  // -------------------------------------------------------------------------
  // getAvailable
  // -------------------------------------------------------------------------
  describe('GET /signer/jobs/available', () => {
    it('returns AvailableJobResponse when a PENDING job exists', async () => {
      const job = makeJob();
      service.signerJobRepository.findAvailable.mockResolvedValueOnce([job]);
      const res = makeRes();

      const result = await controller.getAvailable(res as Response);

      expect(result).toBeDefined();
      expect((result as { requestId: string }).requestId).toBe(REQUEST_ID);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('sets HTTP 204 and returns void when queue is empty', async () => {
      service.signerJobRepository.findAvailable.mockResolvedValueOnce([]);
      const res = makeRes();

      const result = await controller.getAvailable(res as Response);

      expect(result).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('logs a debug message when queue is empty', async () => {
      service.signerJobRepository.findAvailable.mockResolvedValueOnce([]);
      await controller.getAvailable(makeRes() as Response);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('logs a log-level message when a job is served', async () => {
      service.signerJobRepository.findAvailable.mockResolvedValueOnce([makeJob()]);
      await controller.getAvailable(makeRes() as Response);
      expect(logger.log).toHaveBeenCalled();
    });

    it('does NOT include signingPayload in the response', async () => {
      service.signerJobRepository.findAvailable.mockResolvedValueOnce([makeJob()]);
      const result = await controller.getAvailable(makeRes() as Response);
      expect(result).not.toHaveProperty('signingPayload');
      expect(result).not.toHaveProperty('payloadDigest');
      expect(result).not.toHaveProperty('integritySignature');
    });
  });

  // -------------------------------------------------------------------------
  // claimJob
  // -------------------------------------------------------------------------
  describe('POST /signer/jobs/:requestId/claim', () => {
    it('returns ClaimJobResponse with full payload on success', async () => {
      const claimed = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimedBy: 'signer-1',
        claimToken: CLAIM_TOKEN,
        claimedAt: new Date(),
      });
      service.findByRequestId.mockResolvedValueOnce(makeJob());
      service.claimJob.mockResolvedValueOnce(claimed);

      const dto: ClaimJobRequest = { signerInstanceId: 'signer-1' };
      const result = await controller.claimJob(REQUEST_ID, dto);

      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.signingPayload).toBeDefined();
      expect(result.payloadDigest).toBeDefined();
      expect(result.integritySignature).toBeDefined();
    });

    it('calls service.claimJob with a generated uuid claimToken', async () => {
      service.findByRequestId.mockResolvedValueOnce(makeJob());
      service.claimJob.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CLAIMED }));

      await controller.claimJob(REQUEST_ID, { signerInstanceId: 'signer-1' });

      const callArgs = (service.claimJob as jest.Mock).mock.calls[0][0] as { claimToken: string };
      expect(callArgs.claimToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('propagates SignerJobNotFoundError from service (→ 404)', async () => {
      service.findByRequestId.mockRejectedValueOnce(new SignerJobNotFoundError(REQUEST_ID));

      await expect(
        controller.claimJob(REQUEST_ID, { signerInstanceId: 'signer-1' }),
      ).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('propagates SignerJobAlreadyClaimedError from service (→ 409)', async () => {
      service.findByRequestId.mockResolvedValueOnce(makeJob());
      service.claimJob.mockRejectedValueOnce(
        new SignerJobAlreadyClaimedError(JOB_ID, 'other-signer'),
      );

      await expect(
        controller.claimJob(REQUEST_ID, { signerInstanceId: 'signer-1' }),
      ).rejects.toBeInstanceOf(SignerJobAlreadyClaimedError);
    });

    it('logs success after a valid claim', async () => {
      service.findByRequestId.mockResolvedValueOnce(makeJob());
      service.claimJob.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CLAIMED }));

      await controller.claimJob(REQUEST_ID, { signerInstanceId: 'signer-1' });
      expect(logger.log).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // submitResult
  // -------------------------------------------------------------------------
  describe('POST /signer/jobs/:requestId/result', () => {
    it('returns SubmitResultResponse on successful CLAIMED → COMPLETED', async () => {
      const claimedJob = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: CLAIM_TOKEN,
        claimedAt: new Date(Date.now() - 1_000),
      });
      const completedJob = makeJob({
        status: SignerJobStatus.COMPLETED,
        claimToken: CLAIM_TOKEN,
        claimedAt: new Date(Date.now() - 1_000),
        completedAt: new Date(),
      });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockResolvedValueOnce(completedJob);

      const result = await controller.submitResult(REQUEST_ID, makeSubmitDto());

      expect(result.requestId).toBe(REQUEST_ID);
      expect(result.status).toBe(SignerJobStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('excludes signature from the response', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      const completedJob = makeJob({ status: SignerJobStatus.COMPLETED });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockResolvedValueOnce(completedJob);

      const result = await controller.submitResult(REQUEST_ID, makeSubmitDto());

      expect(result).not.toHaveProperty('signature');
      expect(result).not.toHaveProperty('signingPayload');
      expect(result).not.toHaveProperty('payloadDigest');
      expect(result).not.toHaveProperty('integritySignature');
    });

    it('passes the stored claimToken (not body claimToken) to service.completeJob', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await controller.submitResult(REQUEST_ID, makeSubmitDto());

      const callArgs = (service.completeJob as jest.Mock).mock.calls[0][0] as {
        claimToken: string;
      };
      expect(callArgs.claimToken).toBe(CLAIM_TOKEN);
    });

    it('throws 422 when body requestId does not match path requestId', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      const dto = makeSubmitDto({ requestId: 'different-id' });
      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when result.requestId does not match path requestId', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      const dto = makeSubmitDto();
      dto.result = { ...dto.result, requestId: 'different-id' };
      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when integritySignature is absent in stored payload', async () => {
      const badPayload = makePayload({ integritySignature: '' });
      const claimedJob = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: CLAIM_TOKEN,
        payload: badPayload,
      });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      await expect(controller.submitResult(REQUEST_ID, makeSubmitDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when payloadDigest is absent in stored payload', async () => {
      const badPayload = makePayload({ payloadDigest: '' });
      const claimedJob = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: CLAIM_TOKEN,
        payload: badPayload,
      });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      await expect(controller.submitResult(REQUEST_ID, makeSubmitDto())).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when signatureAlgorithm does not match stored payload', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      const dto = makeSubmitDto({ signatureAlgorithm: SignAlgorithm.ED25519 });
      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when result.signatureFormat does not match stored payload', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      const dto = makeSubmitDto();
      dto.result = { ...dto.result, signatureFormat: SignatureFormat.COMPACT };
      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when completedAt is before payload.createdAt', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      const dto = makeSubmitDto({
        completedAt: new Date(Date.now() - 120_000).toISOString(), // before payload.createdAt
      });
      // payload.createdAt is Date.now() - 1000, so completedAt is before it
      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('throws 422 when completedAt is after payload.expiresAt', async () => {
      const badPayload = makePayload({
        expiresAt: new Date(Date.now() - 30_000).toISOString(), // already expired
        createdAt: new Date(Date.now() - 90_000).toISOString(),
      });
      const claimedJob = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: CLAIM_TOKEN,
        payload: badPayload,
      });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);

      await expect(
        controller.submitResult(REQUEST_ID, makeSubmitDto()),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('propagates SignerJobCompletedError for duplicate submissions (→ 409)', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockRejectedValueOnce(new SignerJobCompletedError(JOB_ID));

      await expect(
        controller.submitResult(REQUEST_ID, makeSubmitDto()),
      ).rejects.toBeInstanceOf(SignerJobCompletedError);
    });

    it('propagates SignerJobNotFoundError (→ 404) when job does not exist', async () => {
      service.findByRequestId.mockRejectedValueOnce(new SignerJobNotFoundError(REQUEST_ID));

      await expect(
        controller.submitResult(REQUEST_ID, makeSubmitDto()),
      ).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('logs rejection (warn) and does NOT log signature on integrity failure', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      const dto = makeSubmitDto({ requestId: 'bad-id' });

      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeDefined();

      const warnCall = logger.warn.mock.calls[0]?.[0] as string | undefined;
      expect(warnCall).toBeDefined();
      expect(warnCall).not.toContain('aabbccdd'); // signature must not appear in logs
    });

    it('logs success (log) and does NOT log signature on valid completion', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      const completedJob = makeJob({ status: SignerJobStatus.COMPLETED });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockResolvedValueOnce(completedJob);

      await controller.submitResult(REQUEST_ID, makeSubmitDto());

      const logCall = logger.log.mock.calls[0]?.[0] as string | undefined;
      expect(logCall).toBeDefined();
      expect(logCall).not.toContain('aabbccdd'); // signature must not appear in logs
    });

    it('does NOT call service.completeJob when integrity check fails', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      const dto = makeSubmitDto({ requestId: 'bad-id' });

      await expect(controller.submitResult(REQUEST_ID, dto)).rejects.toBeDefined();
      expect(service.completeJob).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Zero business logic verification
  // -------------------------------------------------------------------------
  describe('Controller zero business-logic invariant', () => {
    it('calls exactly ONE service method per submitResult invocation', async () => {
      const claimedJob = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      const completedJob = makeJob({ status: SignerJobStatus.COMPLETED });
      service.findByRequestId.mockResolvedValueOnce(claimedJob);
      service.completeJob.mockResolvedValueOnce(completedJob);

      await controller.submitResult(REQUEST_ID, makeSubmitDto());

      // findByRequestId is a query (allowed), completeJob is the ONE mutation
      expect(service.completeJob).toHaveBeenCalledTimes(1);
    });
  });
});
