---
title: Transaction hooks (Prisma)
description: Run callbacks after a transaction commits, rolls back, or completes with runOnTransactionCommit / runOnTransactionRollback / runOnTransactionComplete in NestJS + Prisma.
sidebar_label: Transaction hooks
---

# Transaction hooks

Register callbacks from inside a `@Transactional()` method (or
`TransactionHost#withTransaction`) that fire after the transaction settles, via
the `runOnTransactionCommit` / `runOnTransactionRollback` /
`runOnTransactionComplete` API:

```ts
import { runOnTransactionCommit, runOnTransactionRollback, Transactional } from '@nestjs-transactions/prisma';

@Transactional()
async signUp(email: string) {
  const user = await this.prisma.user.create({ data: { email } });
  runOnTransactionCommit(() => this.mailer.sendWelcome(email));   // only after COMMIT
  runOnTransactionRollback((err) => this.metrics.signUpFailed(err));
  return user;
}
```

- Hooks attach to the **innermost active** transaction: a `REQUIRES_NEW` or
  `NESTED` block's hooks fire on its own outcome; a `REQUIRED`-joined method's
  hooks fire with the outer transaction.
- Async hooks are awaited sequentially (in registration order) before the
  transactional method's promise settles; commit hooks run on the **base** client
  (the transaction has already committed), so queries through the injected client
  inside them work.
- A throwing hook is caught and logged — it never masks the method's own result,
  and the remaining hooks still run. `runOnTransactionComplete` receives the
  rollback error, or `undefined` on commit.
- Registering a hook outside an active transaction (including inside a suspended
  `NOT_SUPPORTED`/`NEVER` scope) throws.
