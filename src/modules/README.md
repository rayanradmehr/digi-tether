# modules

Each business domain (network, token, wallet, deposit, withdrawal, sweep,
signer, ledger, ...) will get exactly one folder here in later phases, each
following: Controller, Service, Interfaces, DTO, Entities, Mapper,
Repository, Tests, Config (if needed), README.md.

Phase 0 intentionally contains only `health/`, which is infrastructure, not
business logic.
