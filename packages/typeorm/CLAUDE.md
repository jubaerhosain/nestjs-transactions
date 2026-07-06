# CLAUDE.md — `@nestjs-transactions/typeorm`

See the [root `CLAUDE.md`](../../CLAUDE.md) for repo-wide commands and conventions.

## Purpose

The TypeORM adapter — the package end users install. Keep
`@InjectRepository(Entity)`, add `@Transactional()`, and repositories silently
run on the active transactional `EntityManager` (propagated via CLS). No
monkey-patching; built on `@nestjs-transactions/core` +
`@nestjs-cls/transactional-adapter-typeorm`.

## Public surface (`src/index.ts`)

- `TransactionalModule` — `src/transactional.module.ts`
  (`forRoot` / `forRootAsync` / `forFeature`). `forFeature([Entity])` replaces
  `TypeOrmModule.forFeature([Entity])`.
- `provideTransactionAwareRepository` — `src/repository.provider.ts`.
- `TransactionAwareRepository` — `src/transaction-aware.repository.ts`.
- `IsolationLevel` enum — `src/isolation-level.ts`. Kept in sync with TypeORM's
  own `IsolationLevel` literal type via a **compile-time assertion** in that file
  (`_AssertInSync`); if TypeORM changes its literals, `pnpm typecheck` fails here.
- Re-exported core symbols (`Transactional`, `TransactionHost`, `Propagation`,
  error classes, token helpers) — same identity as core.
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
