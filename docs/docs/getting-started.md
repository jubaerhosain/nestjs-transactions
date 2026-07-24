---
id: getting-started
title: Getting started
description: Install nestjs-transactions and add your first @Transactional() method for NestJS with TypeORM or Prisma.
sidebar_label: Getting started
sidebar_position: 2
---

# Getting started

`nestjs-transactions` ships one adapter per ORM. Pick the one that matches your
stack — both give you the same `@Transactional()` decorator and CLS-based
propagation.

## TypeORM

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

Use `NestjsTypeormModule` from this package **instead of `@nestjs/typeorm`'s
`TypeOrmModule`** — one module owns both the database connection and transaction
propagation:

```ts
// app.module.ts
import { NestjsTypeormModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [NestjsTypeormModule.forRoot({/* all @nestjs/typeorm options ... */})],
})
export class AppModule {}

// member.module.ts — same shape as @nestjs/typeorm's forFeature
@Module({
  imports: [NestjsTypeormModule.forFeature([Member])],
  providers: [MemberService],
})
export class MemberModule {}
```

That's the whole setup. Continue to the **[TypeORM adapter](./typeorm/index.md)**
for propagation modes, multiple data sources, custom repositories, and testing
utilities.

## Prisma

```bash
npm install @nestjs-transactions/prisma @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-prisma nestjs-cls
```

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

Continue to the **[Prisma adapter](./prisma/index.md)** for the full setup,
propagation, and transaction options.

:::note Peer dependencies
Every package listed in the install command is a **peer dependency** — the
adapters ship zero runtime dependencies, so you always control the exact ORM and
`nestjs-cls` versions.
:::
