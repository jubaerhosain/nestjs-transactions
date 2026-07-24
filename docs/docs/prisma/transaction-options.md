---
title: Transaction options & isolation levels (Prisma)
description: Configure Prisma interactive-transaction options — timeout, maxWait, and isolationLevel — per call or as defaults in NestJS.
sidebar_label: Transaction options
---

# Transaction options

The tx options are Prisma's native interactive-`$transaction` options —
`timeout`, `maxWait`, and `isolationLevel`. Set them per call, or as
`defaultTxOptions` for every transaction:

```ts
@Transactional({ propagation: Propagation.REQUIRES_NEW, timeout: 30_000, maxWait: 5_000 })
async audit(entry: AuditEntry) {
  /* ... */
}
```

Use the `IsolationLevel` enum for autocomplete and typo-free values (its members
map to Prisma's isolation-level literals, so a raw string still works too):

```ts
import { IsolationLevel, Transactional, TransactionalModule } from '@nestjs-transactions/prisma';

TransactionalModule.forRoot({
  prismaToken: PrismaService,
  imports: [PrismaModule],
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ, timeout: 10_000 },
});

// per call — overrides the defaults:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
```

Resolve the defaults asynchronously (e.g. from `ConfigService`) with
`forRootAsync`. Only `defaultTxOptions` is resolved at DI time; `prismaToken`,
`sqlFlavor`, and `connectionName` stay static:

```ts
TransactionalModule.forRootAsync({
  prismaToken: PrismaService,
  imports: [PrismaModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    defaultTxOptions: { timeout: config.get('DB_TX_TIMEOUT') },
  }),
});
```

:::caution Default timeout is 5s
Prisma's interactive transactions default to a **5s** timeout (error `P2028`).
Raise it via `defaultTxOptions: { timeout }` in `forRoot` or per call.
:::
