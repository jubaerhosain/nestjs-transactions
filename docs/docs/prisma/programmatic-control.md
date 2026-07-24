---
title: Programmatic control (Prisma)
description: Run transactions imperatively with TransactionHost, or inject the raw active-transaction client with @InjectTransaction() in NestJS + Prisma.
sidebar_label: Programmatic control
---

# Programmatic control

Inject the `TransactionHost` for imperative control without the decorator:

```ts
import { PrismaAdapter, TransactionHost } from '@nestjs-transactions/prisma';

constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

await this.txHost.withTransaction(async () => {
  /* ... */
});
this.txHost.isTransactionActive();
this.txHost.tx; // the current transaction client
```

For a named connection, inject with `@InjectTransactionHost('analytics')`.

## Injecting the raw transaction client

Alternatively, inject the raw active-transaction client directly with
`@InjectTransaction()`. This requires `enableTransactionProxy: true` in
`forRoot()`; outside a transaction it falls back to the base client:

```ts
import { InjectTransaction, Transaction, PrismaAdapter } from '@nestjs-transactions/prisma';

// forRoot({ ..., enableTransactionProxy: true })

constructor(@InjectTransaction() private readonly tx: Transaction<PrismaAdapter>) {}

@Transactional()
async create(email: string) {
  await this.tx.user.create({ data: { email } });
}
```
