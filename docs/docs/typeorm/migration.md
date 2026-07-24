---
title: Migrating from typeorm-transactional
description: Move from the unmaintained typeorm-transactional package to nestjs-transactions — keep @Transactional() and your @InjectRepository services, drop the global bootstrap.
sidebar_label: Coming from typeorm-transactional
---

# Coming from `typeorm-transactional`?

If you're used to marking methods `@Transactional()` and letting your
repositories run inside the transaction, the setup here is deliberately small:

- Swap `@nestjs/typeorm`'s `TypeOrmModule` for this package's
  `NestjsTypeormModule` — `forRoot()` creates the `DataSource` (same options)
  and wires transaction propagation in one import: **no global bootstrap call
  before startup, no manual data-source registration**.
- Use `NestjsTypeormModule.forFeature([Entity])` where you'd register
  repositories for a feature (same shape as `TypeOrmModule.forFeature`).
- Keep your services exactly as they are: `@InjectRepository(Entity)` plus
  `@Transactional({ ... })`, with the **same options-object syntax** for
  [`Propagation`](./propagation.md),
  [`IsolationLevel`](./isolation-levels.md), and the
  [lifecycle hooks](./hooks.md).

## What's different (and why)

- **No monkey-patching.** `typeorm-transactional` patches TypeORM at startup;
  this package registers ordinary DI providers built on
  `@nestjs-cls/transactional`. See [Concepts](../concepts.md).
- **No `initializeTransactionalContext()` / `addTransactionalDataSource()`.**
  Those global setup calls are replaced by the single
  `NestjsTypeormModule.forRoot()` import.
- **Custom repositories:** a plain repository's `repo.extend()` can't be
  intercepted — extend
  [`NestjsTypeormRepository`](./custom-repositories.md) instead.

The lifecycle hooks (`runOnTransactionCommit` / `Rollback` / `Complete`) take no
connection argument, matching `typeorm-transactional`, so those calls port over
unchanged.

## Migrating from v4 (`TransactionalModule`)

v5 merges the previous two-module setup into the single `NestjsTypeormModule`:

- Replace `import { TypeOrmModule } from '@nestjs/typeorm'` +
  `import { TransactionalModule } from '@nestjs-transactions/typeorm'` with a
  single `import { NestjsTypeormModule } from '@nestjs-transactions/typeorm'`.
- Delete the `TransactionalModule.forRoot(...)` lines; move `defaultTxOptions` /
  `enableTransactionProxy` into `NestjsTypeormModule.forRoot({ ...dbOptions, ... })`.
  `name` now also names the transactional connection (`connectionName` is gone
  from the root options).
- Rename both `TypeOrmModule.forFeature(...)` and
  `TransactionalModule.forFeature(...)` to `NestjsTypeormModule.forFeature(...)`
  — same signature.
- `TransactionalRepository` is renamed
  [`NestjsTypeormRepository`](./custom-repositories.md) and now extends
  TypeORM's `Repository<Entity>`: replace `this.repo.x()` with `this.x()` (the
  `this.repo` getter is gone; `this.manager` and `this.txHost` remain). Same
  constructor signature (`super(Entity, txHost)`).
- Attaching to an externally managed `DataSource`
  (`TransactionalModule.forRoot({ dataSource, imports })`) is no longer part of
  the public surface — `forRoot` always owns the `DataSource`. If your app must
  keep managing the `DataSource` itself, register the CLS plugin directly with
  [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional)
  and wire repositories with `provideTransactionAwareRepository`.
