# CLAUDE.md — `@nestjs-transactions/typeorm`

See the [root `CLAUDE.md`](../../CLAUDE.md) for repo-wide commands and conventions.

## Purpose

The TypeORM adapter — the package end users install. Keep
`@InjectRepository(Entity)`, add `@Transactional()`, and repositories run on
the active transactional `EntityManager` (propagated via CLS). No
monkey-patching; built on `@nestjs-transactions/core` +
`@nestjs-cls/transactional-adapter-typeorm`.

## Public surface (`src/index.ts`)

- `Transactional` + `TransactionalOptions` — `src/transactional.ts`. An
  **object-only** decorator: `@Transactional({ connectionName?, propagation?,
isolationLevel? })`, matching `typeorm-transactional`'s ergonomics. It is a
  **facade** that delegates to `@nestjs-cls`'s decorator — same engine, no
  monkey-patching. Note: it always passes the options object as the third
  positional arg to the underlying decorator, forcing the unambiguous branch so
  a connection named like a propagation literal (e.g. `"REQUIRED"`) can't be
  misread. This deliberately breaks the "single symbol identity" rule for
  `Transactional` only — ours is a distinct function wrapping `@nestjs-cls`'s.
  (core's `Transactional` stays the positional `@nestjs-cls` passthrough.)
- `TypeOrmModule` — `src/typeorm.module.ts` (`forRoot` / `forRootAsync` /
  `forFeature`). THE module of this package: a drop-in replacement for
  `@nestjs/typeorm`'s `TypeOrmModule` (deliberately the same class name — users
  change only the import line; never use both) that owns BOTH the DataSource
  (delegating to `@nestjs/typeorm` internally, full options passthrough:
  `autoLoadEntities`, `retryAttempts`, `name`, …) and transaction propagation
  (`defaultTxOptions`, `enableTransactionProxy`). `name` names both the
  DataSource and the transactional connection. Options types:
  `TypeOrmRootOptions` / `TypeOrmRootAsyncOptions` (`src/interfaces.ts`). In
  `forRootAsync`, one shared options module feeds both halves so the user
  factory runs exactly once; `name`/`enableTransactionProxy` must be static.
  `forFeature` internally imports `@nestjs/typeorm`'s `forFeature` for its
  `EntitiesMetadataStorage` side effect (keeps `autoLoadEntities` working) and
  shadows its repository tokens with transaction-aware providers. Both mix-up
  directions with `@nestjs/typeorm`'s module fail at startup: the repository
  provider injects the `TransactionHost` token as **optional** and throws a
  guided bootstrap error when it's missing (their `forRoot` + our
  `forFeature`), and each `forRoot` registers a `RepositoryConflictChecker`
  (`src/repository-conflict-checker.ts`, internal, `onModuleInit`) that sweeps
  Nest's `ModulesContainer` for `instanceof Repository` providers on its
  DataSource whose token has no core-`TRANSACTION_AWARE`-marked instance
  anywhere — i.e. registered via their `forFeature` or hand-rolled — and
  throws/warns per the `repositoryConflictCheck` option (`'error'` default,
  `'warn'`, `'off'`; static in `forRootAsync`). Known blind spot: the same
  entity registered via both packages' `forFeature` on one connection (our
  marked proxy exempts the token) — the README's ESLint
  `no-restricted-imports` guard covers that.
  `src/transactional.module.ts` (`TransactionalModule`) is now **internal** —
  the propagation half composed by `TypeOrmModule`; not exported.
- Re-exports from `@nestjs/typeorm` (same symbol identity): `InjectRepository`,
  `InjectDataSource`, `InjectEntityManager`, `getDataSourceToken`,
  `getRepositoryToken`, `getEntityManagerToken` — so end users need a single
  import. (Deprecated `InjectConnection`/`getConnectionToken` are not
  re-exported.)
- `provideTransactionAwareRepository` — `src/repository.provider.ts`.
- `TransactionalRepository` — `src/transactional.repository.ts`. Base class for
  custom repositories; the entity and `TransactionHost` are passed via the
  constructor (`super(Entity, txHost)`), so subclasses (and user-defined generic
  base repositories) stay plain classes. Use `this.repo` / `this.manager`.
- `IsolationLevel` enum — `src/isolation-level.ts`. Kept in sync with TypeORM's
  own `IsolationLevel` literal type via a **compile-time assertion** in that file
  (`_AssertInSync`); if TypeORM changes its literals, `pnpm typecheck` fails here.
- Re-exported core symbols (`Transactional`, `TransactionHost`, `Propagation`,
  error classes, token helpers) — same identity as core.
- Transaction lifecycle hooks `runOnTransactionCommit`,
  `runOnTransactionRollback`, `runOnTransactionComplete` — re-exported from core
  (`typeorm-transactional` parity). Call them inside a `@Transactional()` method
  to register callbacks that fire after the transaction commits / rolls back /
  completes. See `packages/core/CLAUDE.md` for the mechanism.
- `TransactionalAdapterTypeOrm` + `TypeOrmAdapter` — the underlying `@nestjs-cls`
  adapter, re-exported. `TypeOrmAdapter` is a concise alias (same symbol) for use
  in type positions like `TransactionHost<TypeOrmAdapter>`; the longer name stays
  exported. (Not to be confused with core's generic `TransactionalAdapter` SPI.)
- `TypeOrmTransactionHost` — a **type-only** alias. Use it in type positions
  only; do NOT use it as a constructor-injection annotation (it erases to
  `Object`). Inject the real class or `@InjectTransactionHost('name')` instead.

## Testing

`./testing` subpath export (`src/testing/index.ts`):
`createNoOpTypeOrmTransactionalModule` — a unit-test replacement for
`TypeOrmModule.forRoot()` + `forFeature()` where `@Transactional()` no-ops and
`@InjectRepository` resolves proxies over your mocked `manager.getRepository()`
(no DataSource is created).

- **Unit** (`test/unit/**`, `jest.config.js`): no DB.
- **Integration** (`test/integration/**`, `jest.integration.config.js`,
  `--runInBand`, 30s timeout): **requires two Postgres 17 containers**.

```bash
docker compose up -d --wait   # ports 54321 / 54322
pnpm --filter @nestjs-transactions/typeorm test:int
```

## Commands

```bash
pnpm --filter @nestjs-transactions/typeorm build
pnpm --filter @nestjs-transactions/typeorm typecheck
pnpm --filter @nestjs-transactions/typeorm test:unit
pnpm --filter @nestjs-transactions/typeorm test:int   # needs Postgres (above)
```
