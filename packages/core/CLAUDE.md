# CLAUDE.md — `@nestjs-transactions/core`

See the [root `CLAUDE.md`](../../CLAUDE.md) for repo-wide commands and conventions.

## Purpose

ORM-agnostic building blocks for silent transaction propagation, built on
`@nestjs-cls/transactional`. **End users do not import from this package
directly** — it's a peer that adapter packages (e.g. `@nestjs-transactions/typeorm`)
build on and re-export from.

## Single source of symbol identity

`src/index.ts` re-exports the canonical decorators, tokens, and error classes
from `@nestjs-cls/transactional` (`Transactional`, `TransactionHost`,
`Propagation`, `InjectTransaction`, error classes, token helpers, …). **Every
adapter must re-export these from core, never redefine them** — that guarantees
one symbol identity across all packages.

## Adapter-author SPI

What an adapter package consumes from here:

- `createTransactionalModule` — `src/create-transactional-module.ts`. Base for an
  adapter's `TransactionalModule` (`forRoot`/`forRootAsync`/`forFeature`).
- `createTransactionAwareProxy` — `src/transaction-aware-proxy.ts`. Makes a
  repository/manager silently resolve to the active transactional instance.
- Interfaces — `src/interfaces.ts` (`AdapterRegistration`,
  `TransactionalRootOptionsBase`, `TransactionalAsyncOptionsBase`,
  `TransactionalModuleDefinition`).
- `src/propagation.ts` — propagation surface.

## Testing utilities

`./testing` subpath export (`src/testing/index.ts`) provides
`createNoOpTransactionalModule` and `NoOpTransactionalAdapter` — a drop-in
`TransactionalModule.forRoot()` replacement for unit tests that satisfies
`@Transactional()` / `TransactionHost` injection without opening real transactions.

## Commands

```bash
pnpm --filter @nestjs-transactions/core build
pnpm --filter @nestjs-transactions/core typecheck
pnpm --filter @nestjs-transactions/core test:unit
```
