import { Test, TestingModule } from '@nestjs/testing';
import { SignerJobService } from '../services/signer-job.service';
import { SignerJobRepository } from '../repositories/signer-job.repository';
import { SignerJobStatus } from '../enums/signer-job-status.enum';
import { SignerJobType } from '../enums/signer-job-type.enum';
import { SignAlgorithm } from '../enums/sign-algorithm.enum';
import { SignatureFormat } from '../enums/signature-format.enum';
import { SignerJobAlreadyClaimedError } from '../errors/signer-job-already-claimed.error';
import { INJECTION_TOKENS } from '@shared/tokens/injection-tokens';
import type { SignerJob } from '../entities/signer-job.entity';
import type { SignerPayload } from '../contracts/signer-payload.contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 60_000);
const JOB_ID      = 'aaaaaaaa-0000-0000-0000-000000000001';
const REQUEST_ID  = 'rrrrrrrr-0000-0000-0000-000000000001';
const CLAIM_TOKEN_A = 'cccccccc-aaaa-0000-0000-000000000001';
const CLAIM_TOKEN_B = 'cccccccc-bbbb-0000-0000-000000000002';

const makePayload = (): SignerPayload => ({
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
});

const makePendingJob = (): SignerJob =>
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
  } as SignerJob);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

/**
 * Concurrency tests validate the optimistic-locking behaviour of the service
 * layer. At the unit level (no real DB) we simulate the race by having the
 * mock repository:
 * - Return PENDING for the first caller's findById.
 * - Return CLAIMED (already owned by signer-A) for the second caller's findById.
 *
 * This mirrors what TypeORM's optimistic lock (version column) enforces in
 * production: the losing Signer reads a CLAIMED row and receives the
 * SignerJobAlreadyClaimedError.
 */
describe('SignerJobService — concurrency (simulated race)', () => {
  let service: SignerJobService;
  let repo: jest.Mocked<SignerJobRepository>;

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

    const logger = {
      log: jest.fn(), warn: jest.fn(), error: jest.fn(),
      debug: jest.fn(), verbose: jest.fn(),
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

  it('only one signer wins when two claim simultaneously — loser gets SignerJobAlreadyClaimedError', async () => {
    const pendingJob = makePendingJob();
    const claimedByA = {
      ...makePendingJob(),
      status: SignerJobStatus.CLAIMED,
      claimedBy: 'signer-A',
      claimToken: CLAIM_TOKEN_A,
      claimedAt: new Date(),
      version: 2,
    } as SignerJob;

    // Signer-A reads PENDING and succeeds.
    // Signer-B reads the already-CLAIMED row (post-A commit).
    repo.findById
      .mockResolvedValueOnce(pendingJob)    // Signer-A: sees PENDING
      .mockResolvedValueOnce(claimedByA);  // Signer-B: sees CLAIMED

    repo.update.mockResolvedValueOnce(claimedByA); // Signer-A wins

    const [resultA, resultB] = await Promise.allSettled([
      service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-A', claimToken: CLAIM_TOKEN_A }),
      service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-B', claimToken: CLAIM_TOKEN_B }),
    ]);

    expect(resultA.status).toBe('fulfilled');
    expect(resultB.status).toBe('rejected');
    expect((resultB as PromiseRejectedResult).reason).toBeInstanceOf(
      SignerJobAlreadyClaimedError,
    );
  });

  it('the winning signer owns the claimToken — the loser never persists', async () => {
    const pendingJob = makePendingJob();
    const claimedByA = {
      ...makePendingJob(),
      status: SignerJobStatus.CLAIMED,
      claimedBy: 'signer-A',
      claimToken: CLAIM_TOKEN_A,
      version: 2,
    } as SignerJob;

    repo.findById
      .mockResolvedValueOnce(pendingJob)
      .mockResolvedValueOnce(claimedByA);
    repo.update.mockResolvedValueOnce(claimedByA);

    await Promise.allSettled([
      service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-A', claimToken: CLAIM_TOKEN_A }),
      service.claimJob({ jobId: JOB_ID, signerInstanceId: 'signer-B', claimToken: CLAIM_TOKEN_B }),
    ]);

    // repo.update called exactly once (only signer-A wrote)
    expect(repo.update).toHaveBeenCalledTimes(1);
    const updateArg = (repo.update as jest.Mock).mock.calls[0][1] as Partial<SignerJob>;
    expect(updateArg.claimedBy).toBe('signer-A');
    expect(updateArg.claimToken).toBe(CLAIM_TOKEN_A);
  });

  it('duplicate completeJob for the same job — second call is rejected with SignerJobCompletedError', async () => {
    const { SignerJobCompletedError } = await import('../errors/signer-job-completed.error');
    const { SignerResult } = {} as { SignerResult: unknown }; // type-only import guard
    void SignerResult;

    const claimedJob = {
      ...makePendingJob(),
      status: SignerJobStatus.CLAIMED,
      claimToken: CLAIM_TOKEN_A,
      expiresAt: FUTURE,
    } as SignerJob;

    const completedJob = {
      ...claimedJob,
      status: SignerJobStatus.COMPLETED,
      completedAt: new Date(),
    } as SignerJob;

    const result = {
      requestId: REQUEST_ID,
      signature: 'aabb',
      publicKey: '02aa',
      signAlgorithm: SignAlgorithm.ECDSA_SECP256K1,
      signatureFormat: SignatureFormat.RECOVERABLE,
      signerVersion: '1.0.0',
      signedAt: new Date().toISOString(),
      executionTimeMs: 10,
    };

    // First call: CLAIMED → COMPLETED
    repo.findById.mockResolvedValueOnce(claimedJob);
    repo.update.mockResolvedValueOnce(completedJob);

    // Second call: already COMPLETED
    repo.findById.mockResolvedValueOnce(completedJob);

    await service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN_A, result });

    await expect(
      service.completeJob({ jobId: JOB_ID, claimToken: CLAIM_TOKEN_A, result }),
    ).rejects.toBeInstanceOf(SignerJobCompletedError);

    // update called only once — the second call is rejected before any write
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
});
