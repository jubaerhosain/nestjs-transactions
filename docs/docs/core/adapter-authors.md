---
id: adapter-authors
title: Core & writing an adapter
description: The ORM-agnostic @nestjs-transactions/core building blocks and the SPI for authoring a new transactional adapter.
sidebar_label: Core (adapter authors)
---

# Core & writing an adapter

`@nestjs-transactions/core` holds the ORM-agnostic building blocks for the
`@nestjs-transactions` adapter family, built on
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional).

:::note You don't import from this package directly
Install it as a peer of an adapter (e.g. the
[TypeORM](../typeorm/index.md) or [Prisma](../prisma/index.md) adapter) and import
everything from there. This page is for adapter authors.
:::

## What it provides

- **Canonical re-exports** of `Transactional`, `Propagation`, `TransactionHost`,
  `InjectTransaction(Host)` and the propagation error classes — one symbol
  identity across all adapters.
- **Transaction lifecycle hooks** — `runOnTransactionCommit` /
  `runOnTransactionRollback` / `runOnTransactionComplete` (built on CLS, no
  monkey-patching), re-exported by every adapter.
- **`createTransactionalModule(definition)`** — the factory adapter packages use
  to produce their own `TransactionalModule` (`forRoot`/`forRootAsync`), wired
  through `ClsModule.registerPlugins` so it composes with a host app's own
  `nestjs-cls` setup.
- **`createTransactionAwareProxy(resolve)`** — the lazy proxy primitive that
  re-resolves its target on every property access, with an overrides overlay so
  test spies installed on the proxy survive target switches.
- **`@nestjs-transactions/core/testing`** — `createNoOpTransactionalModule` for
  unit tests without real transactions.

## Writing an adapter

```ts
import { createTransactionalModule } from '@nestjs-transactions/core';

const Base = createTransactionalModule<MyOrmOptions>({
  adapterFactory: (options) => ({
    adapter: new TransactionalAdapterMyOrm({ clientToken: options.client }),
  }),
});

export class TransactionalModule extends Base {
  // add ORM-specific statics (e.g. forFeature) here
}
```

No ORM concept (entity, repository, client) appears in this package's contract —
that's what keeps future adapters source-compatible.
