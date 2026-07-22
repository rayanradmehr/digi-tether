/**
 * Discriminates between a network's native coin and a smart-contract token.
 *
 * IMMUTABLE after creation — changing the type of a token record requires a
 * soft-delete of the old record and registration of a new one.
 *
 * Design notes
 * ------------
 * - `NATIVE`   → native base currency of the network (ETH, TRX, BNB).
 *               `contractAddress` must be NULL.
 *               Only one native token may exist per network.
 * - `CONTRACT` → smart-contract token (ERC-20, TRC-20, BEP-20, …).
 *               `contractAddress` is required and immutable.
 *               Multiple contract tokens may exist per network.
 *
 * Never rename or remove enum values after they have been persisted in
 * production; the string is stored in the `tokens.type` Postgres ENUM column.
 */
export enum TokenType {
  NATIVE = 'native',
  CONTRACT = 'contract',
}
