---
id: concepts
title: How it works — CLS propagation & no monkey-patching
description: How nestjs-transactions propagates transactions through CLS (AsyncLocalStorage) across NestJS services without monkey-patching, built on @nestjs-cls/transactional.
sidebar_label: Concepts
sidebar_position: 3
---

# Concepts

`nestjs-transactions` gives you the decorator-based developer experience of
`typeorm-transactional` — `@InjectRepository(Entity)` + `@Transactional()` — but
built **entirely on top of**
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional)
with no monkey-patching. Understanding the three ideas below explains every
behavior in the adapter docs.

## CLS-based propagation

Transactions flow through **CLS** (Continuation-Local Storage, backed by Node's
`AsyncLocalStorage`). When a `@Transactional()` method starts a transaction, the
active transactional client — TypeORM's `EntityManager` or Prisma's interactive
transaction client — is stored in CLS for the duration of that async call tree.

Any repository or client you injected is a **lazy proxy** that re-resolves its
target on every property access:

- **Inside** a `@Transactional()` method it resolves to the active transactional
  client.
- **Outside** one it resolves to the plain base client.

Because the proxy re-resolves each time, a call several services deep
automatically joins the same transaction — and rolls back together — with no
`EntityManager` or `queryRunner` threaded through your service signatures.

## No monkey-patching

Nothing about your ORM is patched at startup. The adapters register an ordinary
NestJS provider under the token your code already injects (TypeORM's repository
token, or a Prisma client token) whose value is the transaction-aware proxy. That
means:

- A library or ORM upgrade can't silently break global patched prototypes.
- Everything is standard NestJS dependency injection — testable and inspectable.

## Single symbol identity

`core` re-exports the canonical `Transactional`, `TransactionHost`,
`Propagation`, `InjectTransaction(Host)`, and the propagation error classes from
`@nestjs-cls/transactional`, and every adapter re-exports them from `core`. So
`@Transactional`, `TransactionHost`, `Propagation`, etc. share **one identity**
across all packages — you can mix imports freely.

The one deliberate exception is each adapter's own `Transactional` decorator: a
thin **object-form facade** over the `@nestjs-cls` decorator that resolves a
positional-argument ambiguity (so a connection named like a propagation literal
can't be misread). It uses the same underlying engine — still no monkey-patching.

## Lifecycle hooks

`runOnTransactionCommit`, `runOnTransactionRollback`, and
`runOnTransactionComplete` let you register callbacks from inside a transactional
method that fire **after** the transaction settles. They attach to the innermost
active transaction via a CLS registry key — the same ORM-agnostic mechanism in
every adapter. See the per-adapter **Transaction hooks** pages for details.
