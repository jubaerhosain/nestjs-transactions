# @nestjs-transactions/core

ORM-agnostic building blocks for the `@nestjs-transactions` adapter family, built on [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional).

**You don't import from this package directly** — install it as a peer of an adapter and import everything from there:

- [`@nestjs-transactions/typeorm`](https://www.npmjs.com/package/@nestjs-transactions/typeorm) — transaction-aware `@InjectRepository` repositories for TypeORM
- [`@nestjs-transactions/prisma`](https://www.npmjs.com/package/@nestjs-transactions/prisma) — one transaction-aware Prisma client via `@InjectPrismaClient`

📖 **[Full documentation → jubaerhosain.github.io/nestjs-transactions](https://jubaerhosain.github.io/nestjs-transactions/)** (see [Core & writing an adapter](https://jubaerhosain.github.io/nestjs-transactions/docs/core/adapter-authors))

## What it provides

- Canonical re-exports of `Transactional`, `Propagation`, `TransactionHost`, `InjectTransaction(Host)` and the propagation error classes — one symbol identity across all adapters.
- Transaction lifecycle hooks — `runOnTransactionCommit` / `runOnTransactionRollback` / `runOnTransactionComplete` (built on CLS, no monkey-patching), re-exported by every adapter.
- `createTransactionalModule(definition)` — the factory adapter packages use to produce their own `TransactionalModule` (`forRoot`/`forRootAsync`), wired through `ClsModule.registerPlugins` so it composes with a host app's own `nestjs-cls` setup.
- `createTransactionAwareProxy(resolve)` — the lazy proxy primitive that re-resolves its target on every property access, with an overrides overlay so test spies installed on the proxy survive target switches.
- `@nestjs-transactions/core/testing` — `createNoOpTransactionalModule` for unit tests without real transactions.

See the **[adapter authors guide](https://jubaerhosain.github.io/nestjs-transactions/docs/core/adapter-authors)** for a walkthrough of writing your own adapter.

## License

MIT
