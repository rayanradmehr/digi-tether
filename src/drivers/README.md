# drivers

Houses the `BlockchainDriver` abstraction (ADR-004) and, in later phases, the
concrete `EvmDriver` / `TronDriver` implementations. Business modules depend
only on `BlockchainDriver`, never on a concrete SDK, so adding a new network
never requires changing business logic.

Phase 0 contains the interface only — no implementation, per scope rules.
