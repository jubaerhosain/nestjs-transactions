---
title: Introduction
description: Start here — which nestjs-transactions adapter to install for TypeORM or Prisma, what every page of these docs covers, and where to read first.
slug: /
sidebar_label: Introduction
---

# Introduction

These are the reference docs for `nestjs-transactions`. This page is the map:
which package to install for your ORM, what the rest of the documentation
covers, and where to start reading. If you would rather have working code in
front of you first, skip ahead to
[Getting started](./getting-started.md).

Transaction management shouldn't leak into your code. You keep your existing
repositories, add `@Transactional()` to a method, and everything it calls —
however many services deep — quietly runs on the same transaction and rolls back
together. [Concepts](./concepts.md) explains how that works at runtime, and why
nothing is patched at startup to make it happen.

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

## How these docs are organised

- **[Getting started](./getting-started.md)** — install the adapter for your ORM
  and wire up a first transaction.
- **[Concepts](./concepts.md)** — what CLS-based propagation does at runtime,
  and what "no monkey-patching" buys you.
- **[TypeORM adapter](./typeorm/index.md)** — the full manual: propagation
  modes, isolation levels, multiple data sources, lifecycle hooks, programmatic
  control, custom repositories, testing, and migrating off
  [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional).
- **[Prisma adapter](./prisma/index.md)** — the full manual: propagation modes,
  transaction options, multiple connections, lifecycle hooks, programmatic
  control, and testing.
- **[Writing an adapter](./core/adapter-authors.md)** — the
  `@nestjs-transactions/core` SPI, if you want to support another ORM.

Each adapter's manual ends with a **Caveats** page. Read it before you ship —
it covers the cases where propagation does not apply.
