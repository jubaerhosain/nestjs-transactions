---
title: Prisma adapter
description: Declarative @Transactional() for NestJS + Prisma. Inject one transaction-aware Prisma client, add one decorator, and drop the $transaction boilerplate — no monkey-patching.
sidebar_label: Overview
slug: /prisma
---

# Prisma adapter

**Declarative `@Transactional()` for NestJS + Prisma.** Inject **one**
transaction-aware Prisma client, add one decorator, and drop the `$transaction`
boilerplate — transactions propagate through CLS (`AsyncLocalStorage`) across
services. Standard NestJS dependency injection built on the actively maintained
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional):
**no monkey-patching**. The same decorator-based ergonomics the
[TypeORM adapter](../typeorm/index.md) offers, for Prisma.

## Install

```bash
npm install @nestjs-transactions/prisma @nestjs-transactions/core \
  @prisma/client @nestjs-cls/transactional \
  @nestjs-cls/transactional-adapter-prisma nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies. `@nestjs/common` and `@nestjs/core` are peers too, but every NestJS app already has them; you likely already have `@prisma/client` as well.)

## Quick start

Provide your Prisma client the canonical NestJS way:

```ts
// prisma.module.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

:::note Prisma 7 / driver adapters
Prisma 7 requires a driver adapter. Pass it to the `PrismaClient` constructor
exactly as you would without this package — nothing here changes:

```ts
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString }) });
  }
  async onModuleInit() {
    await this.$connect();
  }
}
```

:::

Register the transactional module once at the app root:

```ts
// app.module.ts
import { TransactionalModule } from '@nestjs-transactions/prisma';

@Module({
  imports: [
    PrismaModule,
    TransactionalModule.forRoot({
      prismaToken: PrismaService,
      sqlFlavor: 'postgresql', // enables Propagation.NESTED (savepoints)
      imports: [PrismaModule],
    }),
  ],
})
export class AppModule {}
```

What each option does:

- **`prismaToken`** _(required)_ — the DI token your `PrismaClient`/`PrismaService`
  is provided under. It can be any token, including a string token holding an
  `$extends`-ed client.
- **`imports`** — the module(s) that export the client under `prismaToken`, so
  the adapter can resolve it (here, `PrismaModule` — note it
  `exports: [PrismaService]`).
- **`sqlFlavor`** — required only for `Propagation.NESTED`, which emulates
  savepoints with raw SQL (see [Propagation](./propagation.md)).
- **`defaultTxOptions`** — default `$transaction` options (`timeout`, `maxWait`,
  `isolationLevel`) for every transaction (see
  [Transaction options](./transaction-options.md)).

`TransactionalModule.forRoot()` registers the `@nestjs-cls/transactional` CLS
plugin that powers `@Transactional()`; it does **not** create a connection — it
resolves the client you already provide. Unlike the TypeORM adapter, there is
**no `forFeature`**: Prisma has no per-entity registration, so one `forRoot()` is
the whole setup.

Then inject the transaction-aware client anywhere:

```ts
// user.service.ts
import {
  InjectPrismaClient,
  Transactional,
  runOnTransactionCommit,
} from '@nestjs-transactions/prisma';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    @InjectPrismaClient() private readonly prisma: Prisma.TransactionClient,
    private readonly audit: AuditService,
  ) {}

  @Transactional()
  async signUp(email: string) {
    const user = await this.prisma.user.create({ data: { email } });
    await this.audit.record(user.id); // joins the SAME transaction — no decorator needed there
    runOnTransactionCommit(() => this.mailer.sendWelcome(email)); // only after COMMIT
    return user;
  }
}
```

If `signUp` throws, everything rolls back — including writes made in
`AuditService`. Outside a transaction the injected client behaves like the plain
base client. Calls to other `@Transactional()` methods join the same transaction
by default (`Propagation.REQUIRED`).

## How it works

`@InjectPrismaClient()` resolves a provider whose value is a lazy proxy over
`txHost.tx` (core's `createTransactionAwareProxy`). `txHost.tx` is the active
interactive-transaction client inside a `@Transactional()` method and the base
client outside it. Because the proxy re-resolves on every property access, one
injected client silently follows the current transaction. No prototypes are
patched; it is ordinary NestJS dependency injection. See
[Concepts](../concepts.md).

## On this section

- **[Propagation](./propagation.md)** — the seven propagation modes and the `NESTED`/`sqlFlavor` rule.
- **[Transaction options](./transaction-options.md)** — `timeout`, `maxWait`, `isolationLevel`.
- **[Multiple connections](./multiple-connections.md)** — named clients.
- **[Transaction hooks](./hooks.md)** — run code after commit/rollback.
- **[Programmatic control](./programmatic-control.md)** — `TransactionHost` and `@InjectTransaction()`.
- **[Testing](./testing.md)** — the no-op module for unit tests.
- **[Caveats](./caveats.md)**.
