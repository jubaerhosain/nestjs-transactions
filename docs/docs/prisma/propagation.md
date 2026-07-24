---
title: Propagation modes (Prisma)
description: The seven @Transactional() propagation modes for NestJS + Prisma, plus the NESTED/sqlFlavor savepoint rule.
sidebar_label: Propagation
---

# Propagation

Control how a `@Transactional()` method relates to an already-active transaction
with the `Propagation` enum:

```ts
import { Propagation, Transactional } from '@nestjs-transactions/prisma';

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

:::warning `NESTED` requires `sqlFlavor`
`Propagation.NESTED` requires `sqlFlavor` (savepoints are emulated with raw SQL —
not available on MongoDB). **Without `sqlFlavor`, a `NESTED` call inside a
transaction logs a warning and runs as an _independent_ transaction (like
`REQUIRES_NEW`) — it does not join the outer one.** `REQUIRES_NEW` (and the
`NESTED` fallback) take a second pooled connection.
:::
