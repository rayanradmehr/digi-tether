# common/validators

Custom stateless `class-validator` constraints reused across multiple module DTOs.

## Files
- `is-blockchain-address.validator.ts` — `@IsBlockchainAddress()`
- `is-positive-decimal.validator.ts` — `@IsPositiveDecimal()`
- `is-iso-currency-code.validator.ts` — `@IsISOCurrencyCode()`

## Rules
- No validators that inject services or query the database
- No domain rules encoded here (e.g. "this address must be registered")
- Each constraint must be fully stateless
