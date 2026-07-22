/**
 * Foundation contract for the Driver Layer (ADR-004).
 *
 * WHY this exists in Phase 0 despite "no blockchain business logic": this is
 * a pure interface, not an implementation. Declaring it now lets every
 * future module (Wallet, Deposit, Withdrawal, Sweep) depend on this
 * abstraction via DI from day one, instead of being written against a
 * concrete EVM/Tron SDK and refactored later. No EVM/Tron driver
 * implementation is created in this phase.
 */
export interface BlockchainDriver {
  readonly networkType: string;

  getBalance(address: string, tokenContract?: string): Promise<string>;
  getNonce(address: string): Promise<number>;
  estimateFee(rawTransaction: unknown): Promise<string>;
  buildTransaction(params: unknown): Promise<unknown>;
  broadcastTransaction(signedTransaction: string): Promise<string>;
}
