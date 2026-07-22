# database

Owns the PostgreSQL connection lifecycle (ADR-003) for the entire modular
monolith. Migrations live under `database/migrations` (created once the
first business entity is introduced). Business modules register their own
entities/repositories, but never configure the connection themselves.
