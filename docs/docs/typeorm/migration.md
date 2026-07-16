---
id: migration
title: Migrating from typeorm-transactional
description: Move from the unmaintained typeorm-transactional package to nestjs-transactions — keep @Transactional() and your @InjectRepository services, drop the global bootstrap.
sidebar_label: Coming from typeorm-transactional
---

# Coming from `typeorm-transactional`?

If you're used to marking methods `@Transactional()` and letting your
repositories run inside the transaction, the setup here is deliberately small:

- Register `TransactionalModule.forRoot()` once at the app root — **no global
  bootstrap call before startup, no manual data-source registration**. It
  resolves the `DataSource` through the standard `@nestjs/typeorm` tokens.
- Use `TransactionalModule.forFeature([Entity])` where you'd register
  repositories for a feature (in place of `TypeOrmModule.forFeature`).
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
  `TransactionalModule.forRoot()` import.
- **Custom repositories:** `repo.extend()` can't be intercepted — use
  [`TransactionalRepository`](./custom-repositories.md) instead.

The lifecycle hooks (`runOnTransactionCommit` / `Rollback` / `Complete`) take no
connection argument, matching `typeorm-transactional`, so those calls port over
unchanged.
