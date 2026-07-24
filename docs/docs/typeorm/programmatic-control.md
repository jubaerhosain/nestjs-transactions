---
title: Programmatic control with TransactionHost (TypeORM)
description: Run transactions imperatively without the @Transactional() decorator using TransactionHost in NestJS + TypeORM.
sidebar_label: Programmatic control
---

# Programmatic control

Inject `TransactionHost` for imperative control without the decorator:

```ts
import { TransactionalAdapterTypeOrm, TransactionHost } from '@nestjs-transactions/typeorm';

constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

await this.txHost.withTransaction(async () => {
  /* ... */
});
this.txHost.isTransactionActive();
this.txHost.tx; // the current EntityManager
```

For a named connection inject with `@InjectTransactionHost('stats')`.
