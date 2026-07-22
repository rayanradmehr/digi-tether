import { Test, TestingModule } from '@nestjs/testing';
import { SignerJobService } from '../services/signer-job.service';
import { SignerJobRepository } from '../repositories/signer-job.repository';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobType } from '../enums/signer-job-type.enum';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignatureFormat } from '../enums/signature-format.enum';
import { SignerJobNotFoundError } from '../errors/signer-job-not-found.error';
import { SignerJobExpiredError } from '../errors/signer-job-expired.error';
import { SignerJobAlreadyClaimedError } from '../errors/signer-job-already-claimed.error';
import { SignerJobInvalidStatusError } from '../errors/signer-job-invalid-status.error';
import { SignerJobCompletedError } from '../errors/signer-job-completed.error';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { SignerJob } from '../entities/signer-job.entity';
import type { SignerPayload } from '../contracts/signer-payload.contract';
import type { SignerResult } from '../contracts/signer-result.contract';
import type { CreateJobParams } from '../services/signer-job.service.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 60_000);
const PAST = new Date(Date.now() - 60_000);
const JOB_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const REQUEST_ID = 'rrrrrrrr-0000-0000-0000-000000000001';
const WALLET_ID = 'wwwwwwww-0000-0000-0000-000000000001';
const NETWORK_ID = 'nnnnnnnn-0000-0000-0000-000000000001';
const CLAIM_TOKEN = 'cccccccc-0000-0000-0000-000000000001';

const makePayload = (overrides: Partial<SignerPayload> = {}): SignerPayload => ({
  payloadVersion: 1,
  protocolVersion: 1,
  transactionVersion: 1,
  requestId: REQUEST_ID,
  walletId: WALLET_ID,
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
    walletId: WALLET_ID,
    networkId: NETWORK_ID,
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

const makeResult = (): SignerResult => ({
  requestId: REQUEST_ID,
  signature: 'aabbccdd',
  publicKey: '02aabbcc',
  signAlgorithm: SignAlgorithm.ECDSA_SECP256K1,
  signatureFormat: SignatureFormat.RECOVERABLE,
  signerVersion: '1.0.0',
  signedAt: new Date().toISOString(),
  executionTimeMs: 42,
});

const makeCreateParams = (): CreateJobParams => ({
  jobType: SignerJobType.WITHDRAW,
  networkId: NETWORK_ID,
  walletId: WALLET_ID,
  referenceId: 'ref-uuid',
  referenceType: 'withdrawal',
  payload: makePayload(),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SignerJobService', () => {
  let service: SignerJobService;
  let repo: jest.Mocked<SignerJobRepository>;
  let logger: {
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    verbose: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findById: jest.fn(),
      findByRequestId: jest.fn(),
      findByReference: jest.fn(),
      findAvailable: jest.fn(),
      findAll: jest.fn(),
      existsByRequestId: jest.fn(),
      getStats: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<SignerJobRepository>;

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignerJobService,
        { provide: SignerJobRepository, useValue: repo },
        { provide: INJECTION_TOKENS.LOGGER, useValue: logger },
      ],
    }).compile();

    service = module.get(SignerJobService);
  });

  // -------------------------------------------------------------------------
  // createJob
  // -------------------------------------------------------------------------
  describe('createJob', () => {
    it('creates a PENDING job with retryCount = 0 and persists it', async () => {
      const saved = makeJob();
      repo.create.mockResolvedValueOnce(saved);

      const result = await service.createJob(makeCreateParams());

      expect(repo.create).toHaveBeenCalledOnce();
      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.status).toBe(SignerJobStatus.PENDING);
      expect(arg.retryCount).toBe(0);
      expect(arg.claimedBy).toBeNull();
      expect(arg.claimToken).toBeNull();
      expect(arg.result).toBeNull();
      expect(result.id).toBe(JOB_ID);
    });

    it('denormalises requestId from payload into the entity column', async () => {
      repo.create.mockResolvedValueOnce(makeJob());
      const params = makeCreateParams();

      await service.createJob(params);

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.requestId).toBe(params.payload.requestId);
    });

    it('denormalises payloadVersion and protocolVersion from payload', async () => {
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(makeCreateParams());

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.payloadVersion).toBe(1);
      expect(arg.protocolVersion).toBe(1);
    });

    it('converts payload.expiresAt ISO string to a Date for the column', async () => {
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(makeCreateParams());

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.expiresAt).toBeInstanceOf(Date);
    });

    it('stores the complete payload object verbatim', async () => {
      repo.create.mockResolvedValueOnce(makeJob());
      const params = makeCreateParams();

      await service.createJob(params);

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.payload).toStrictEqual(params.payload);
    });

    it('logs a structured message after successful creation', async () => {
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(makeCreateParams());

      expect(logger.log).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  describe('findById', () => {
    it('returns the job when it exists', async () => {
      const job = makeJob();
      repo.findById.mockResolvedValueOnce(job);

      const result = await service.findById(JOB_ID);

      expect(result).toStrictEqual(job);
    });

    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.findById('missing')).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // findByRequestId
  // -------------------------------------------------------------------------
  describe('findByRequestId', () => {
    it('returns the job when it exists', async () => {
      const job = makeJob();
      repo.findByRequestId.mockResolvedValueOnce(job);

      const result = await service.findByRequestId(REQUEST_ID);

      expect(result).toStrictEqual(job);
    });

    it('throws SignerJobNotFoundError when no row matches the requestId', async () => {
      repo.findByRequestId.mockResolvedValueOnce(null);

      await expect(service.findByRequestId('missing')).rejects.toBeInstanceOf(
        SignerJobNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // exists
  // -------------------------------------------------------------------------
  describe('exists', () => {
    it('returns true when the repository reports the job exists', async () => {
      repo.existsByRequestId.mockResolvedValueOnce(true);

      expect(await service.exists(JOB_ID)).toBe(true);
    });

    it('returns false when the repository reports the job does not exist', async () => {
      repo.existsByRequestId.mockResolvedValueOnce(false);

      expect(await service.exists('missing')).toBe(false);
    });

    it('never throws even when the job is absent', async () => {
      repo.existsByRequestId.mockResolvedValueOnce(false);

      await expect(service.exists('any-id')).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // countPending
  // -------------------------------------------------------------------------
  describe('countPending', () => {
    it('returns the PENDING count from getStats', async () => {
      repo.getStats.mockResolvedValueOnce({
        byStatus: {
          [SignerJobStatus.PENDING]: 5,
          [SignerJobStatus.CLAIMED]: 2,
          [SignerJobStatus.COMPLETED]: 10,
          [SignerJobStatus.FAILED]: 1,
          [SignerJobStatus.EXPIRED]: 0,
          [SignerJobStatus.CANCELLED]: 0,
        },
        byType: {
          [SignerJobType.CREATE_WALLET]: 3,
          [SignerJobType.SWEEP]: 7,
          [SignerJobType.WITHDRAW]: 8,
        },
        staleClaimed: 0,
      });

      expect(await service.countPending()).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // countClaimed
  // -------------------------------------------------------------------------
  describe('countClaimed', () => {
    it('returns the CLAIMED count from getStats', async () => {
      repo.getStats.mockResolvedValueOnce({
        byStatus: {
          [SignerJobStatus.PENDING]: 5,
          [SignerJobStatus.CLAIMED]: 2,
          [SignerJobStatus.COMPLETED]: 10,
          [SignerJobStatus.FAILED]: 1,
          [SignerJobStatus.EXPIRED]: 0,
          [SignerJobStatus.CANCELLED]: 0,
        },
        byType: {
          [SignerJobType.CREATE_WALLET]: 3,
          [SignerJobType.SWEEP]: 7,
          [SignerJobType.WITHDRAW]: 8,
        },
        staleClaimed: 0,
      });

      expect(await service.countClaimed()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // claimJob — valid transitions
  // -------------------------------------------------------------------------
  describe('claimJob — valid transitions', () => {
    it('transitions PENDING → CLAIMED and stores signer identity', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: FUTURE });
      const claimed = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimedBy: 'signer-1',
        claimToken: CLAIM_TOKEN,
        claimedAt: new Date(),
      });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(claimed);

      const result = await service.claimJob({
        jobId: JOB_ID,
        signerInstanceId: 'signer-1',
        claimToken: CLAIM_TOKEN,
      });

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.status).toBe(SignerJobStatus.CLAIMED);
      expect(updateArg.claimedBy).toBe('signer-1');
      expect(updateArg.claimToken).toBe(CLAIM_TOKEN);
      expect(updateArg.claimedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(SignerJobStatus.CLAIMED);
    });

    it('logs a structured message after successful claim', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(
        makeJob({ status: SignerJobStatus.CLAIMED, claimedBy: 'signer-1' }),
      );

      await service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN });

      expect(logger.log).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // claimJob — invalid transitions
  // -------------------------------------------------------------------------
  describe('claimJob — invalid transitions', () => {
    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(
        service.claimJob({ jobId: 'missing', signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('throws SignerJobExpiredError when expiresAt is in the past', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: PAST });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobExpiredError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws SignerJobAlreadyClaimedError when status is CLAIMED', async () => {
      const job = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimedBy: 'signer-2',
        expiresAt: FUTURE,
      });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobAlreadyClaimedError);
    });

    it('throws SignerJobInvalidStatusError when status is COMPLETED', async () => {
      const job = makeJob({ status: SignerJobStatus.COMPLETED, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is CANCELLED', async () => {
      const job = makeJob({ status: SignerJobStatus.CANCELLED, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is FAILED', async () => {
      const job = makeJob({ status: SignerJobStatus.FAILED, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is EXPIRED', async () => {
      const job = makeJob({ status: SignerJobStatus.EXPIRED, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });
  });

  // -------------------------------------------------------------------------
  // completeJob — valid transitions
  // -------------------------------------------------------------------------
  describe('completeJob — valid transitions', () => {
    it('transitions CLAIMED → COMPLETED and stores SignerResult', async () => {
      const result = makeResult();
      const job = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: CLAIM_TOKEN,
        expiresAt: FUTURE,
      });
      const completed = makeJob({
        status: SignerJobStatus.COMPLETED,
        result,
        completedAt: new Date(),
      });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(completed);

      const updated = await service.completeJob({
        jobId: JOB_ID,
        claimToken: CLAIM_TOKEN,
        result,
      });

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.status).toBe(SignerJobStatus.COMPLETED);
      expect(updateArg.result).toStrictEqual(result);
      expect(updateArg.completedAt).toBeInstanceOf(Date);
      expect(updated.status).toBe(SignerJobStatus.COMPLETED);
    });

    it('logs a structured message after successful completion', async () => {
      const job = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() });

      expect(logger.log).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // completeJob — invalid transitions
  // -------------------------------------------------------------------------
  describe('completeJob — invalid transitions', () => {
    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(
        service.completeJob({ jobId: 'missing', claimToken: CLAIM_TOKEN, result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('throws SignerJobCompletedError when already COMPLETED', async () => {
      const job = makeJob({ status: SignerJobStatus.COMPLETED });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobCompletedError);
    });

    it('throws SignerJobInvalidStatusError when status is PENDING', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, claimToken: CLAIM_TOKEN });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when claimToken does not match', async () => {
      const job = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimToken: 'correct-token',
      });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.completeJob({ jobId: JOB_ID, claimToken: 'wrong-token', result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws SignerJobInvalidStatusError when status is FAILED', async () => {
      const job = makeJob({ status: SignerJobStatus.FAILED, claimToken: CLAIM_TOKEN });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is CANCELLED', async () => {
      const job = makeJob({ status: SignerJobStatus.CANCELLED, claimToken: CLAIM_TOKEN });
      repo.findById.mockResolvedValueOnce(job);

      await expect(
        service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });
  });

  // -------------------------------------------------------------------------
  // cancelJob — valid transitions
  // -------------------------------------------------------------------------
  describe('cancelJob — valid transitions', () => {
    it('transitions PENDING → CANCELLED', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING });
      const cancelled = makeJob({ status: SignerJobStatus.CANCELLED, completedAt: new Date() });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(cancelled);

      const result = await service.cancelJob(JOB_ID);

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.status).toBe(SignerJobStatus.CANCELLED);
      expect(result.status).toBe(SignerJobStatus.CANCELLED);
    });

    it('transitions CLAIMED → CANCELLED', async () => {
      const job = makeJob({ status: SignerJobStatus.CLAIMED, claimedBy: 'signer-1' });
      const cancelled = makeJob({ status: SignerJobStatus.CANCELLED });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(cancelled);

      const result = await service.cancelJob(JOB_ID);

      expect(result.status).toBe(SignerJobStatus.CANCELLED);
    });

    it('logs a structured message after successful cancellation', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CANCELLED }));

      await service.cancelJob(JOB_ID);

      expect(logger.log).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cancelJob — invalid transitions
  // -------------------------------------------------------------------------
  describe('cancelJob — invalid transitions', () => {
    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.cancelJob('missing')).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('throws SignerJobCompletedError when already COMPLETED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await expect(service.cancelJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobCompletedError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws SignerJobInvalidStatusError when status is FAILED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.FAILED }));

      await expect(service.cancelJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is EXPIRED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.EXPIRED }));

      await expect(service.cancelJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is CANCELLED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CANCELLED }));

      await expect(service.cancelJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });
  });

  // -------------------------------------------------------------------------
  // expireJob — valid transitions
  // -------------------------------------------------------------------------
  describe('expireJob — valid transitions', () => {
    it('transitions PENDING → EXPIRED when expiresAt has passed', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: PAST });
      const expired = makeJob({ status: SignerJobStatus.EXPIRED, completedAt: new Date() });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(expired);

      const result = await service.expireJob(JOB_ID);

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.status).toBe(SignerJobStatus.EXPIRED);
      expect(result.status).toBe(SignerJobStatus.EXPIRED);
    });

    it('transitions CLAIMED → EXPIRED when expiresAt has passed', async () => {
      const job = makeJob({
        status: SignerJobStatus.CLAIMED,
        claimedBy: 'signer-1',
        expiresAt: PAST,
      });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.EXPIRED }));

      const result = await service.expireJob(JOB_ID);

      expect(result.status).toBe(SignerJobStatus.EXPIRED);
    });

    it('emits a warn-level log on expiry', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: PAST });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.EXPIRED }));

      await service.expireJob(JOB_ID);

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // expireJob — invalid transitions
  // -------------------------------------------------------------------------
  describe('expireJob — invalid transitions', () => {
    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.expireJob('missing')).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('throws SignerJobInvalidStatusError when already COMPLETED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await expect(service.expireJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when already EXPIRED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.EXPIRED }));

      await expect(service.expireJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when already CANCELLED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CANCELLED }));

      await expect(service.expireJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when already FAILED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.FAILED }));

      await expect(service.expireJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when expiresAt has NOT yet passed', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);

      await expect(service.expireJob(JOB_ID)).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // incrementRetry
  // -------------------------------------------------------------------------
  describe('incrementRetry', () => {
    it('increments retryCount by 1 from 0', async () => {
      const job = makeJob({ retryCount: 0 });
      const updated = makeJob({ retryCount: 1 });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(updated);

      const result = await service.incrementRetry(JOB_ID);

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.retryCount).toBe(1);
      expect(result.retryCount).toBe(1);
    });

    it('increments retryCount by 1 from 2', async () => {
      const job = makeJob({ retryCount: 2 });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ retryCount: 3 }));

      await service.incrementRetry(JOB_ID);

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.retryCount).toBe(3);
    });

    it('throws SignerJobInvalidStatusError when retryCount is already at maximum', async () => {
      const job = makeJob({ retryCount: 3 }); // MAX_RETRY_COUNT = 3
      repo.findById.mockResolvedValueOnce(job);

      await expect(service.incrementRetry(JOB_ID)).rejects.toBeInstanceOf(
        SignerJobInvalidStatusError,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(service.incrementRetry('missing')).rejects.toBeInstanceOf(
        SignerJobNotFoundError,
      );
    });

    it('logs a structured message after incrementing', async () => {
      const job = makeJob({ retryCount: 0 });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ retryCount: 1 }));

      await service.incrementRetry(JOB_ID);

      expect(logger.log).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // markFailed — valid transitions
  // -------------------------------------------------------------------------
  describe('markFailed — valid transitions', () => {
    it('transitions CLAIMED → FAILED and stores the reason', async () => {
      const job = makeJob({ status: SignerJobStatus.CLAIMED, claimedBy: 'signer-1' });
      const failed = makeJob({
        status: SignerJobStatus.FAILED,
        errorMessage: 'key not found',
        completedAt: new Date(),
      });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(failed);

      const result = await service.markFailed({ jobId: JOB_ID, reason: 'key not found' });

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg.status).toBe(SignerJobStatus.FAILED);
      expect(updateArg.errorMessage).toBe('key not found');
      expect(updateArg.completedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(SignerJobStatus.FAILED);
    });

    it('logs an error-level message after marking failed', async () => {
      const job = makeJob({ status: SignerJobStatus.CLAIMED });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.FAILED }));

      await service.markFailed({ jobId: JOB_ID, reason: 'HSM error' });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // markFailed — invalid transitions
  // -------------------------------------------------------------------------
  describe('markFailed — invalid transitions', () => {
    it('throws SignerJobNotFoundError when the job does not exist', async () => {
      repo.findById.mockResolvedValueOnce(null);

      await expect(
        service.markFailed({ jobId: 'missing', reason: 'x' }),
      ).rejects.toBeInstanceOf(SignerJobNotFoundError);
    });

    it('throws SignerJobInvalidStatusError when status is PENDING', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.PENDING }));

      await expect(
        service.markFailed({ jobId: JOB_ID, reason: 'x' }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is COMPLETED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await expect(
        service.markFailed({ jobId: JOB_ID, reason: 'x' }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is CANCELLED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CANCELLED }));

      await expect(
        service.markFailed({ jobId: JOB_ID, reason: 'x' }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });

    it('throws SignerJobInvalidStatusError when status is EXPIRED', async () => {
      repo.findById.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.EXPIRED }));

      await expect(
        service.markFailed({ jobId: JOB_ID, reason: 'x' }),
      ).rejects.toBeInstanceOf(SignerJobInvalidStatusError);
    });
  });

  // -------------------------------------------------------------------------
  // Immutable field enforcement — service must never mutate them
  // -------------------------------------------------------------------------
  describe('Immutable field enforcement', () => {
    it('createJob: does not modify signingPayload in the payload after creation', async () => {
      const params = makeCreateParams();
      const originalPayload = params.payload.signingPayload;
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(params);

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      // Payload must be stored verbatim — the same reference object or identical value
      expect(arg.payload?.signingPayload).toBe(originalPayload);
    });

    it('createJob: does not modify payloadDigest in the payload', async () => {
      const params = makeCreateParams();
      const originalDigest = params.payload.payloadDigest;
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(params);

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.payload?.payloadDigest).toBe(originalDigest);
    });

    it('createJob: does not modify integritySignature in the payload', async () => {
      const params = makeCreateParams();
      const originalSig = params.payload.integritySignature;
      repo.create.mockResolvedValueOnce(makeJob());

      await service.createJob(params);

      const arg = (repo.create as jest.Mock).mock.calls[0][0] as Partial<SignerJob>;
      expect(arg.payload?.integritySignature).toBe(originalSig);
    });

    it('claimJob: does not include payload in the update changes', async () => {
      const job = makeJob({ status: SignerJobStatus.PENDING, expiresAt: FUTURE });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.CLAIMED }));

      await service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-1', claimToken: CLAIM_TOKEN });

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg).not.toHaveProperty('payload');
      expect(updateArg).not.toHaveProperty('requestId');
      expect(updateArg).not.toHaveProperty('walletId');
      expect(updateArg).not.toHaveProperty('networkId');
    });

    it('completeJob: does not modify the payload column in the update changes', async () => {
      const job = makeJob({ status: SignerJobStatus.CLAIMED, claimToken: CLAIM_TOKEN });
      repo.findById.mockResolvedValueOnce(job);
      repo.update.mockResolvedValueOnce(makeJob({ status: SignerJobStatus.COMPLETED }));

      await service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN, result: makeResult() });

      const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
      expect(updateArg).not.toHaveProperty('payload');
      expect(updateArg).not.toHaveProperty('requestId');
    });
  });
});
