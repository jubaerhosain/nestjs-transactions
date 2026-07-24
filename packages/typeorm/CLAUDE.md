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
- `NestjsTypeormModule` — `src/nestjs-typeorm.module.ts` (`forRoot` /
  `forRootAsync` / `forFeature`). THE module of this package: a unified,
  distinctly-named module (NOT shadowing `@nestjs/typeorm`'s `TypeOrmModule` —
  use this one instead) that owns BOTH the DataSource (delegating to
  `@nestjs/typeorm` internally, full options passthrough: `autoLoadEntities`,
  `retryAttempts`, `name`, …) and transaction propagation (`defaultTxOptions`,
  `enableTransactionProxy`). `name` names both the DataSource and the
  transactional connection. Options types: `NestjsTypeormRootOptions` /
  `NestjsTypeormRootAsyncOptions` (`src/interfaces.ts`). In `forRootAsync`, one
  shared options module feeds both halves so the user factory runs exactly
  once; `name`/`enableTransactionProxy` must be static, and it is factory-only
  (no `useClass`/`useExisting`). `forFeature` rejects a nest-style raw
  DataSource/DataSourceOptions second arg (guided error — wrap as
  `{ dataSource }`) and a split `{ connectionName, dataSource }` whose names
  differ. `forFeature`
  internally imports `@nestjs/typeorm`'s `forFeature` for its
  `EntitiesMetadataStorage` side effect (keeps `autoLoadEntities` working) and
  shadows its repository tokens with transaction-aware providers.
  `src/transactional.module.ts` (`TransactionalModule`) is **internal** — the
  propagation half composed by `NestjsTypeormModule`; not exported.
- Re-exports from `@nestjs/typeorm` (same symbol identity): `InjectRepository`,
  `InjectDataSource`, `InjectEntityManager`, `getDataSourceToken`,
  `getRepositoryToken`, `getEntityManagerToken` — so end users need a single
  import. (Deprecated `InjectConnection`/`getConnectionToken` are not
  re-exported.)
- `provideTransactionAwareRepository` — `src/repository.provider.ts`.
- `NestjsTypeormRepository` — `src/nestjs-typeorm.repository.ts`. Base class for
  custom repositories that **extends TypeORM's `Repository<Entity>`**: inherited
  methods are called directly on `this` (`this.find()`, `this.save()`, …) and are
  transaction-aware — the constructor replaces the own `manager` data property
  with a live accessor over `txHost.tx` via `Object.defineProperty` (TypeORM's
  methods read `this.manager` per call; a unit spec pins this assumption).
  `extend()` is overridden (TypeORM's snapshots the manager and re-invokes the
  subclass constructor with wrong positional args). Entity and `TransactionHost`
  passed via constructor (`super(Entity, txHost)`); `this.txHost` protected; no
  `repo` getter. Tree methods not inherited — use
  `this.manager.getTreeRepository(this.target)`.
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
`NestjsTypeormModule.forRoot()` + `forFeature()` where `@Transactional()` no-ops and
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
pnpm --filter @nestjs-transactions/typeorm test:cov   # unit tests + coverage report
pnpm --filter @nestjs-transactions/typeorm test:int   # needs Postgres (above)
```
