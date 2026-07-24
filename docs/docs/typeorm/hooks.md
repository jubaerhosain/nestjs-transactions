---
title: Transaction hooks (TypeORM)
description: Run callbacks after a transaction commits, rolls back, or completes with runOnTransactionCommit / runOnTransactionRollback / runOnTransactionComplete in NestJS + TypeORM.
sidebar_label: Transaction hooks
---

# Transaction hooks

Register callbacks from inside a `@Transactional()` method (or
`TransactionHost#withTransaction`) that fire after the transaction settles, via
the `runOnTransactionCommit` / `runOnTransactionRollback` /
`runOnTransactionComplete` API:

```ts
import { runOnTransactionCommit, runOnTransactionRollback, Transactional } from '@nestjs-transactions/typeorm';

@Transactional()
async register(name: string) {
  const member = await this.repo.save({ name });
  runOnTransactionCommit(() => this.mailer.sendWelcome(member)); // only after COMMIT
  runOnTransactionRollback((err) => this.metrics.registrationFailed(err));
  return member;
}
```

- Hooks attach to the **innermost active** transaction: a `REQUIRES_NEW` or
  `NESTED` block's hooks fire on its own outcome; a `REQUIRED`-joined method's
  hooks fire with the outer transaction.
- Async hooks are awaited sequentially (in registration order) before the
  transactional method's promise settles; commit hooks run on the **base**
  connection (the transaction has already committed), so repository calls inside
  them work.
- A throwing hook is caught and logged — it never masks the method's own result,
  and the remaining hooks still run. `runOnTransactionComplete` receives the
  rollback error, or `undefined` on commit.
- Registering a hook outside an active transaction (including inside a suspended
  `NOT_SUPPORTED`/`NEVER` scope) throws.
