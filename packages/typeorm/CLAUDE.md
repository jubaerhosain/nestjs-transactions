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
- `TransactionalModule` — `src/transactional.module.ts`
  (`forRoot` / `forRootAsync` / `forFeature`). `forFeature([Entity])` replaces
  `TypeOrmModule.forFeature([Entity])`.
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
`forRoot()` + `forFeature()` where `@Transactional()` no-ops and
`@InjectRepository` resolves proxies over your mocked `manager.getRepository()`.

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
