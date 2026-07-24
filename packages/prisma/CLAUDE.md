# CLAUDE.md — `@nestjs-transactions/prisma`

See the [root `CLAUDE.md`](../../CLAUDE.md) for repo-wide commands and conventions.

## Purpose

The Prisma adapter — an end-user package. Inject one transaction-aware Prisma
client (`@InjectPrismaClient()`), add `@Transactional()`, and every query
silently runs inside the active interactive transaction (propagated via CLS).
No monkey-patching; built on `@nestjs-transactions/core` +
`@nestjs-cls/transactional-adapter-prisma`.

## Public surface (`src/index.ts`)

- `Transactional` + `TransactionalOptions` — `src/transactional.ts`. The
  **object-only** facade: `@Transactional({ connectionName?, propagation?,
maxWait?, timeout?, isolationLevel? })`. Same engine as `@nestjs-cls`'s
  decorator (always passes the options object as the third positional arg —
  see the typeorm CLAUDE.md for why). The tx options are Prisma's native
  `$transaction` options.
- `TransactionalModule` — `src/transactional.module.ts` (`forRoot` /
  `forRootAsync`; **no `forFeature`** — Prisma has no per-entity registration).
  `forRoot({ prismaToken, sqlFlavor?, defaultTxOptions?, imports?,
connectionName? })`. `prismaToken` is required — the DI token the app's
  `PrismaClient`/`PrismaService` is provided under. `sqlFlavor` (e.g.
  `'postgresql'`) is required for `Propagation.NESTED` (raw-SQL savepoints).
- `InjectPrismaClient` / `getPrismaClientToken` /
  `provideTransactionAwarePrismaClient` — `src/prisma-client.provider.ts`. The
  headline DX: a proxy over `txHost.tx` (transaction client inside
  `@Transactional()`, base client outside), built on core's
  `createTransactionAwareProxy`.
- `IsolationLevel` enum — `src/isolation-level.ts`. Ergonomic isolation
  levels (`@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })`).
  Named and cased to match the typeorm adapter's `IsolationLevel` (SCREAMING_SNAKE
  members); only the underlying string values differ (Prisma's PascalCase
  literals, e.g. `'Serializable'`, vs TypeORM's SQL literals).
  **Unlike typeorm's `IsolationLevel`, the compile-time sync guard lives in the
  tests** (`test/unit/isolation-level.spec.ts`), not in `src/`: Prisma's
  isolation union is only on the _generated_ client, and `src/` deliberately
  never imports it (so `build` works without `prisma generate`). `pnpm typecheck`
  runs `prisma generate` and type-checks tests, so the guard still fails the
  build if Prisma's literals drift.
- Re-exported core symbols (`TransactionHost`, `Propagation`, error classes,
  token helpers, hooks `runOnTransactionCommit/Rollback/Complete`) — same
  identity as core.
- `TransactionalAdapterPrisma` + `PrismaAdapter` (alias, same symbol) and types
  `PrismaTransactionalClient`, `PrismaTransactionOptions` — re-exported from
  the upstream adapter. `PrismaTransactionHost<TClient>` — **type-only** alias
  (do not use as a constructor-injection annotation).
- Types `PrismaTransactionalOptions`, `PrismaTransactionalAsyncOptions`,
  `PrismaTxOptions`, `SqlFlavor` — `src/interfaces.ts`.

## Prisma-version gotchas

- **Public API is structurally generic** — `src/` never imports the generated
  client, so `pnpm build` works without `prisma generate` and Prisma 7 users
  with a custom generator `output` path (where `PrismaClient` is not importable
  from `@prisma/client`) pass their client type via the `TClient` generics.
- **Tests use `prisma-client-js`** (deprecated in Prisma 7 but working):
  the new `prisma-client` generator emits ESM by default, which clashes with
  this repo's CJS/node16 setup. `typecheck`/`test:int` scripts chain
  `prisma generate` (the integration tests import the generated client).
- Known limitations to keep documented: `NESTED` needs `sqlFlavor` (no
  MongoDB) — **without it, `Propagation.NESTED` inside a transaction logs a
  warning and opens an INDEPENDENT transaction (REQUIRES_NEW-like), it does
  not join the outer one** (upstream fallback, pinned by
  `test/unit/propagation.spec.ts`); Prisma's interactive-transaction default
  `timeout` is **5s** (`P2028`) — raise via `defaultTxOptions` or per call; the
  sequential/batch `$transaction([...])` form is unsupported (inherent to the
  CLS design); `REQUIRES_NEW` takes a second pooled connection.

## Testing

`./testing` subpath export (`src/testing/index.ts`):
`createNoOpPrismaTransactionalModule({ client?, connectionName? })` — a
unit-test replacement for `forRoot()` where `@Transactional()` no-ops and
`@InjectPrismaClient()` resolves a proxy over your mock client.

- **Unit** (`test/unit/**`, `jest.config.js`): no DB, structural fake client.
- **Integration** (`test/integration/**`, `jest.integration.config.js`,
  `--runInBand`, 30s timeout): uses **postgres-a only** (port 54321), inside a
  dedicated `prisma` Postgres schema (`prisma.config.ts`) so the typeorm tables
  in `public` stay untouched. `test:int` runs `prisma db push` itself.

```bash
docker compose up -d --wait   # postgres-a on 54321
pnpm --filter @nestjs-transactions/prisma test:int
```

## Commands

```bash
pnpm --filter @nestjs-transactions/prisma build       # no prisma generate needed
pnpm --filter @nestjs-transactions/prisma typecheck   # runs prisma generate first
pnpm --filter @nestjs-transactions/prisma test:unit
pnpm --filter @nestjs-transactions/prisma test:cov    # unit tests + coverage report
pnpm --filter @nestjs-transactions/prisma test:int    # needs Postgres (above)
```
