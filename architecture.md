ADR-001: Architecture style → Modular Monolith
Reason: Faster delivery with clear module boundaries.

ADR-002: Queue → RabbitMQ
Reason: Reliable messaging with retries and DLQ.

ADR-003: ORM → TypeORM
Reason: Mature NestJS integration and migration support.

ADR-004: Blockchain integration → Driver abstraction
Reason: Business logic must remain independent from blockchain SDKs.

ADR-005: Signing → Offline Signer
Reason: Private keys must never exist in the backend.