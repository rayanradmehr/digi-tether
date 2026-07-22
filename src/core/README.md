# core

Framework-independent building blocks shared by the domain/application layer
of every module: `Result`, `DomainError`, and future primitives such as
`AggregateRoot` or `ValueObject`.

Rules:
- Must never import from `@nestjs/*` or any blockchain SDK.
- Must never import from `modules/*` (only the reverse is allowed).
- No business rules for a specific domain (wallet, deposit, ...) live here —
  only generic, reusable primitives.
