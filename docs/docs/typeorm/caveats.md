---
id: caveats
title: Caveats (TypeORM)
description: Known limitations when using nestjs-transactions with TypeORM — duplicate entity registration, Promise.all inside a transaction, repo.extend(), and existing nestjs-cls setups.
sidebar_label: Caveats
---

# Caveats

- **Don't register the same entity with both** `TypeOrmModule.forFeature` and
  `TransactionalModule.forFeature` in the same module — they claim the same
  token; the last registration wins.
- **`Promise.all` of queries inside one transaction** runs on a single database
  connection (a TypeORM/driver constraint shared by every transaction solution).
  Await sequentially inside transactions, or use `Propagation.REQUIRES_NEW` for
  genuine parallelism.
- **`repo.extend()`** can't be intercepted — use
  [`TransactionalRepository`](./custom-repositories.md).
- If your app already uses `nestjs-cls` (`ClsModule.forRoot`), everything just
  works: this package only registers a CLS _plugin_ and never calls
  `ClsModule.forRoot()` itself.
