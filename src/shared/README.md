# shared

Shared kernel: small, stable, framework-independent types/utilities used by
more than one module's domain layer (e.g. `Nullable<T>`). Unlike `core/`,
which holds architectural primitives (Result, DomainError), `shared/` holds
plain data-shape helpers. Kept intentionally minimal — anything module
specific belongs inside that module, not here.
