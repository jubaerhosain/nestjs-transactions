---
title: Propagation modes (TypeORM)
description: The seven @Transactional() propagation modes for NestJS + TypeORM — REQUIRED, REQUIRES_NEW, NESTED, MANDATORY, NEVER, SUPPORTS, NOT_SUPPORTED.
sidebar_label: Propagation
---

# Propagation

Control how a `@Transactional()` method relates to an already-active transaction
with the `Propagation` enum:

```ts
import { Propagation, Transactional } from '@nestjs-transactions/typeorm';

@Transactional({ propagation: Propagation.REQUIRES_NEW })
async audit(entry: AuditEntry) {
  /* commits even if the caller rolls back */
}
```

| Mode                   | Behavior                                            |
| ---------------------- | --------------------------------------------------- |
| `REQUIRED` _(default)_ | Join the current transaction, or start one          |
| `REQUIRES_NEW`         | Always start an independent transaction             |
| `NESTED`               | Savepoint: inner rollback doesn't kill the outer tx |
| `MANDATORY`            | Throw `TransactionNotActiveError` if no transaction |
| `NEVER`                | Throw `TransactionAlreadyActiveError` if inside one |
| `SUPPORTS`             | Join if present, run plainly otherwise              |
| `NOT_SUPPORTED`        | Suspend the transaction for this call               |

The default is `REQUIRED`: a method with no explicit propagation joins the
caller's transaction if one is active, or opens a new one otherwise.
