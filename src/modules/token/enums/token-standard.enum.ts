/**
 * Token protocol standard.
 *
 * Drives amount-encoding rules, ABI decoding patterns, and transfer-method
 * selection in the Drivers layer. More precise than `TokenType` alone —
 * two contract tokens can share `type = contract` while one is ERC-20 and
 * the other is TRC-20, requiring completely different transfer invocations.
 *
 * Permitted driver mappings
 * --------------------------
 * | Standard | NetworkDriver | TokenType |
 * |----------|---------------|----------|
 * | native   | evm OR tron   | native   |
 * | erc20    | evm           | contract |
 * | trc20    | tron          | contract |
 *
 * Adding a new chain family (e.g. Solana/SPL) requires only a new enum
 * member here and a corresponding member in `NetworkDriver`. The Token
 * entity schema does not change (Invariant 18).
 *
 * Never rename or remove enum values after they have been persisted in
 * production; the string is stored in the `tokens.standard` Postgres ENUM column.
 */
export enum TokenStandard {
  /** Native base currency — EVM (ETH, BNB) or Tron (TRX). */
  NATIVE = 'native',

  /** ERC-20 fungible token on an EVM-compatible chain. */
  ERC20 = 'erc20',

  /** TRC-20 fungible token on the Tron network. */
  TRC20 = 'trc20',
}
