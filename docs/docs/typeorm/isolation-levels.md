---
id: isolation-levels
title: Isolation levels & transaction options (TypeORM)
description: Set default and per-call transaction isolation levels for NestJS + TypeORM with the type-safe IsolationLevel enum.
sidebar_label: Isolation levels
---

# Transaction options

Use the `IsolationLevel` enum for autocomplete and typo-free values (its members
map to TypeORM's isolation-level literals, so a raw string still works too):

```ts
import { IsolationLevel, Transactional, TransactionalModule } from '@nestjs-transactions/typeorm';

TransactionalModule.forRoot({
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
});

// per call — options are typed for TypeORM, no type argument needed:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
```

Resolve the defaults asynchronously (e.g. from `ConfigService`) with
`forRootAsync`:

```ts
TransactionalModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    defaultTxOptions: { isolationLevel: config.get('DB_ISOLATION') },
  }),
});
```

:::info Kept in sync with TypeORM
`IsolationLevel` is kept in lockstep with TypeORM's own isolation-level literal
type via a compile-time assertion — if TypeORM changes its literals, the type
check fails at build time rather than drifting silently.
:::
