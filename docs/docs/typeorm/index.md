---
id: index
title: TypeORM adapter
description: Declarative @Transactional() for NestJS + TypeORM. Keep @InjectRepository(Entity), add one decorator — transactions propagate through CLS across services, with no monkey-patching.
sidebar_label: Overview
slug: /typeorm
---

# TypeORM adapter

**Declarative `@Transactional()` for NestJS + TypeORM.** Keep
`@InjectRepository(Entity)`, add one decorator — transactions propagate through
CLS (`AsyncLocalStorage`) across services. Standard NestJS dependency injection
built on the actively maintained
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional):
**no monkey-patching**. Inspired by
[`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) —
a decorator-based approach many NestJS developers already know, but that is no
longer maintained.

## Install

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies.)

## Quick start

```ts
// app.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionalModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [TypeOrmModule.forRoot({/* ... */}), TransactionalModule.forRoot()],
})
export class AppModule {}
```

Both root imports are required and do different jobs:

- **`TypeOrmModule.forRoot()`** (from `@nestjs/typeorm`) owns the **database
  connection** — the `DataSource`, pool, and entity metadata. Standard NestJS +
  TypeORM; nothing here is specific to this package.
- **`TransactionalModule.forRoot()`** owns **transaction propagation** — it
  registers the `@nestjs-cls/transactional` CLS plugin that powers
  `@Transactional()` (starting/committing/rolling back transactions and swapping
  the active `EntityManager`). It does **not** create a connection; it resolves
  the `DataSource` that `TypeOrmModule` registered.

Neither replaces the other: with only `TypeOrmModule`, `@Transactional()` does
nothing; with only `TransactionalModule`, there is no `DataSource` to run
transactions against. Register both once at the app root.

```ts
// member.module.ts — use INSTEAD of TypeOrmModule.forFeature([Member])
@Module({
  imports: [TransactionalModule.forFeature([Member])],
  providers: [MemberService, AccountingService],
})
export class MemberModule {}
```

```ts
// member.service.ts — completely vanilla NestJS + TypeORM
import { Transactional } from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    private readonly accounting: AccountingService,
  ) {}

  @Transactional()
  async register(name: string) {
    const member = await this.repo.save({ name });
    await this.accounting.openAccount(member); // joins the SAME transaction —
    return member; // no decorator needed there
  }
}
```

If `register` throws, everything rolls back — including writes made in
`AccountingService`. Outside a transaction the repository behaves like a plain
TypeORM repository.

## How it works

`forFeature([Member])` registers a provider under TypeORM's standard repository
token — the exact token `@InjectRepository` resolves — whose value is a lazy
proxy over `txHost.tx.getRepository(Member)`. `txHost.tx` is the transactional
`EntityManager` inside `@Transactional()` and the regular one outside. No
prototypes are patched; it is ordinary NestJS dependency injection. See
[Concepts](../concepts.md) for the full picture.

## On this section

- **[Propagation](./propagation.md)** — the seven propagation modes.
- **[Isolation levels](./isolation-levels.md)** — set defaults and per-call isolation.
- **[Multiple data sources](./multiple-data-sources.md)** — named connections.
- **[Transaction hooks](./hooks.md)** — run code after commit/rollback.
- **[Programmatic control](./programmatic-control.md)** — `TransactionHost` without the decorator.
- **[Custom repositories](./custom-repositories.md)** — `TransactionalRepository`.
- **[Testing](./testing.md)** — the no-op module for unit tests.
- **[Migrating from typeorm-transactional](./migration.md)**.
- **[Caveats](./caveats.md)**.
