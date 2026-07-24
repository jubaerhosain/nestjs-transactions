---
title: nestjs-transactions
description: Declarative @Transactional() for NestJS with TypeORM and Prisma. Transactions propagate through CLS across services, with zero monkey-patching.
slug: /
sidebar_label: Introduction
---

# nestjs-transactions

**Declarative transaction propagation for NestJS with vanilla ergonomics.** Keep
`@InjectRepository(Entity)`, add `@Transactional()`, done — transactions
propagate through CLS (`AsyncLocalStorage`), across services, with **zero
monkey-patching**.

```ts
@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    private readonly accounting: AccountingService,
  ) {}

  @Transactional()
  async register(name: string) {
    const member = await this.repo.save({ name });
    await this.accounting.openAccount(member); // joins the SAME transaction
    return member; // no decorator needed there
  }
}
```

## Why

Transaction management shouldn't leak into your code. You keep your
`@InjectRepository(Entity)` repositories, add `@Transactional()` to a method, and
the repository quietly runs on the active transaction — no `EntityManager` or
`queryRunner` threaded through your services, no boilerplate.

- **Invisible propagation.** Transactions flow through CLS (`AsyncLocalStorage`),
  so a call several services deep joins the same transaction and rolls back
  together.
- **Plain dependency injection.** It's built on the actively maintained
  [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional)
  — TypeORM's classes are never patched at startup, so a library upgrade can't
  break you unexpectedly.
- **Familiar ergonomics.** Inspired by
  [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional)
  — a decorator-based approach many NestJS developers already know, but that is
  no longer maintained.

## Packages

| Package                                                  | Use it for                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@nestjs-transactions/typeorm`](./typeorm/index.md)     | TypeORM — transaction-aware `@InjectRepository` repositories                               |
| [`@nestjs-transactions/prisma`](./prisma/index.md)       | Prisma — one transaction-aware client via `@InjectPrismaClient`                            |
| [`@nestjs-transactions/core`](./core/adapter-authors.md) | ORM-agnostic building blocks (installed automatically as a peer; you don't import from it) |

Every adapter exposes the same surface — `Transactional`, `Propagation`,
`TransactionHost`, and the `runOnTransactionCommit`/`Rollback`/`Complete`
lifecycle hooks — from a single import. Each ships one module to wire it up:
the TypeORM adapter's unified `NestjsTypeormModule` (which also owns the
database connection), and the Prisma adapter's `TransactionalModule`.

## Next steps

- **[Getting started](./getting-started.md)** — install and wire up your first transaction.
- **[Concepts](./concepts.md)** — how CLS-based propagation works, and why there's no monkey-patching.
- **[TypeORM adapter](./typeorm/index.md)** / **[Prisma adapter](./prisma/index.md)** — the full API for each ORM.
