---
'@nestjs-transactions/typeorm': minor
'@nestjs-transactions/core': minor
---

Typed, uniform enum surface for transaction options.

- **`IsolationLevel` enum** (`@nestjs-transactions/typeorm`): set isolation with a typed,
  autocompletable value — `@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })`.
  Members map to TypeORM's isolation-level literals, so raw strings still work.
- **`Transactional` is now typed for TypeORM**: options like `{ isolationLevel }` are inferred
  without a `<TransactionalAdapterTypeOrm>` type argument. Same runtime function (identity
  preserved) — only the option types are specialized.
- **`Propagation` members are now SCREAMING_CASE** (`Propagation.REQUIRES_NEW` instead of
  `Propagation.RequiresNew`) for consistency with `IsolationLevel`. Each member is the
  underlying `@nestjs-cls/transactional` value, so it's accepted anywhere the library expects a
  propagation (decorator, `TransactionHost#withTransaction`). **Breaking:** update any
  `Propagation.PascalCase` usages to SCREAMING_CASE.
