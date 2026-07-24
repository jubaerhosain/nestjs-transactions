---
title: Isolation levels & transaction options (TypeORM)
description: Set default and per-call transaction isolation levels for NestJS + TypeORM with the type-safe IsolationLevel enum.
sidebar_label: Isolation levels
---

# Transaction options

Use the `IsolationLevel` enum for autocomplete and typo-free values (its members
map to TypeORM's isolation-level literals, so a raw string still works too):

```ts
import { IsolationLevel, NestjsTypeormModule, Transactional } from '@nestjs-transactions/typeorm';

NestjsTypeormModule.forRoot({
  /* ...database options... */
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
});

// per call — options are typed for TypeORM, no type argument needed:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
```

Resolve the options asynchronously (e.g. from `ConfigService`) with
`forRootAsync` — the factory returns the **combined** options (database +
`defaultTxOptions`) and runs exactly once:

```ts
NestjsTypeormModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    url: config.get('DATABASE_URL'),
    type: 'postgres',
    defaultTxOptions: { isolationLevel: config.get('DB_ISOLATION') },
  }),
});
```

In `forRootAsync`, `name` and `enableTransactionProxy` must be **static** (on
the outer options object, not returned by the factory) — DI tokens are computed
at module-definition time. `forRootAsync` is factory-only: `@nestjs/typeorm`'s
`useClass`/`useExisting` forms are not supported (wrap such a provider in
`useFactory`/`inject` instead).

:::info Kept in sync with TypeORM
`IsolationLevel` is kept in lockstep with TypeORM's own isolation-level literal
type via a compile-time assertion — if TypeORM changes its literals, the type
check fails at build time rather than drifting silently.
:::
