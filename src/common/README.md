# common

NestJS-specific, cross-cutting concerns shared across modules: global
exception filters, interceptors, guards, pipes, shared DTOs (e.g.
`ErrorResponseDto`) and reusable Swagger decorators.

Difference from `core/`: everything here is allowed to depend on
`@nestjs/common` / `@nestjs/swagger`. Nothing here may contain domain
business rules for a specific module.
