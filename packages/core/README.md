# @nestjs-transactional/core

ORM-agnostic building blocks for the `@nestjs-transactional` adapter family, built on [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional).

**You don't import from this package directly** — install it as a peer of an adapter and import everything from there:

- [`@nestjs-transactional/typeorm`](https://www.npmjs.com/package/@nestjs-transactional/typeorm) — silent `@InjectRepository` repositories for TypeORM

## What it provides

- Canonical re-exports of `Transactional`, `Propagation`, `TransactionHost`, `InjectTransaction(Host)` and the propagation error classes — one symbol identity across all adapters.
- `createTransactionalModule(definition)` — the factory adapter packages use to produce their own `TransactionalModule` (`forRoot`/`forRootAsync`), wired through `ClsModule.registerPlugins` so it composes with a host app's own `nestjs-cls` setup.
- `createTransactionAwareProxy(resolve, base?)` — the lazy proxy primitive that re-resolves its target on every property access.
- `ConnectionRegistry` — duplicate-registration diagnostics.
- `@nestjs-transactional/core/testing` — `createNoOpTransactionalModule` for unit tests without real transactions.

## Writing an adapter

```ts
import { createTransactionalModule } from '@nestjs-transactional/core';

const Base = createTransactionalModule<MyOrmOptions>({
  adapterFactory: (options) => ({
    adapter: new TransactionalAdapterMyOrm({ clientToken: options.client }),
  }),
});

export class TransactionalModule extends Base {
  // add ORM-specific statics (e.g. forFeature) here
}
```

No ORM concept (entity, repository, client) appears in this package's contract — that's what keeps future adapters source-compatible.

## License

MIT
