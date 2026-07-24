---
title: Caveats (TypeORM)
description: Known limitations when using nestjs-transactions with TypeORM — duplicate entity registration, Promise.all inside a transaction, repo.extend(), and existing nestjs-cls setups.
sidebar_label: Caveats
---

# Caveats

- **Register the `DataSource` with `NestjsTypeormModule`, and repositories with
  `NestjsTypeormModule.forFeature`.** Repositories registered instead with
  `@nestjs/typeorm`'s `TypeOrmModule.forFeature` (or hand-rolled `Repository`
  providers) are plain repositories bound to the base `EntityManager` — they
  **bypass `@Transactional()`** and their writes escape rollback.
- **Don't register the same entity with both** `@nestjs/typeorm`'s
  `TypeOrmModule.forFeature` and `NestjsTypeormModule.forFeature` in the same
  module — they claim the same token; the last registration wins.
- **`Promise.all` of queries inside one transaction** runs on a single database
  connection (a TypeORM/driver constraint shared by every transaction solution).
  Await sequentially inside transactions, or use `Propagation.REQUIRES_NEW` for
  genuine parallelism.
- **`repo.extend()` on a plain repository** can't be intercepted — extend
  [`NestjsTypeormRepository`](./custom-repositories.md), whose subclasses
  support a transaction-aware `.extend()`.
- If your app already uses `nestjs-cls` (`ClsModule.forRoot`), everything just
  works: this package only registers a CLS _plugin_ and never calls
  `ClsModule.forRoot()` itself.
