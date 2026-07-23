import { WalletFamily } from '../enums/wallet-family.enum';

/**
 * The only payload the Wallet Module sends to SignerJobService when
 * creating a CREATE_WALLET job for pool replenishment.
 *
 * Contract rules (ARCHITECTURE.md §15, Decision 7):
 *
 * This payload MUST contain:
 *   - driverFamily  — which cryptographic family to generate
 *   - quantity      — number of wallets requested (always 1 per job in current impl)
 *   - reason        — human-readable origination context
 *
 * This payload MUST NOT contain:
 *   - addresses
 *   - public keys
 *   - private keys
 *   - cryptographic material of any kind
 *   - transaction data
 *   - blockchain payloads
 *   - signatures
 *
 * All blockchain payload generation belongs exclusively to the
 * Offline Signer project. The Wallet Module is payload-agnostic.
 *
 * Used by:
 *   - WalletPoolService.replenish() — creates jobs via SignerJobService.
 */
export interface CreateWalletJobPayload {
  /**
   * Cryptographic address family to generate.
   * Determines the signing algorithm and address derivation scheme
   * used by the Offline Signer.
   */
  readonly driverFamily: WalletFamily;

  /**
   * Number of wallets to generate for this job.
   * In current implementation: always 1 (one job per wallet).
   * Reserved for future batch-generation support.
   */
  readonly quantity: number;

  /**
   * Human-readable reason describing why this job was created.
   * Examples: 'pool_replenishment', 'manual_operator_request'.
   * Used for audit and observability only — not transmitted to the Signer.
   */
  readonly reason: string;
}
