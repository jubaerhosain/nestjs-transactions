---
id: caveats
title: Caveats (Prisma)
description: Known limitations when using nestjs-transactions with Prisma — NESTED needs sqlFlavor, the 5s timeout, no batch $transaction, Prisma 7 client types, and existing nestjs-cls setups.
sidebar_label: Caveats
---

# Caveats

- **`Propagation.NESTED` needs `sqlFlavor`.** Without it, a `NESTED` call inside a
  transaction logs a warning and opens an **independent** transaction
  (`REQUIRES_NEW`-like) instead of joining the outer one. Savepoints aren't
  available on MongoDB.
- **Default timeout is 5s.** Prisma's interactive transactions default to a **5s**
  timeout (error `P2028`). Raise it via `defaultTxOptions: { timeout }` in
  `forRoot` or per call.
- **No sequential/batch `$transaction([...])`.** Only the interactive (callback)
  form is supported — inherent to the CLS design. `REQUIRES_NEW` uses a second
  pooled connection.
- **Prisma 7 / custom client output.** The API is generic over your client type —
  annotate injection sites with your generated `Prisma.TransactionClient` (or
  `PrismaTransactionalClient<MyClient>`). `prismaToken` can be any DI token,
  including one holding an `$extends`-ed client.
- **Existing `nestjs-cls`.** If your app already calls `ClsModule.forRoot(...)`,
  everything just works: this package only registers a CLS _plugin_ and never
  calls `ClsModule.forRoot()` itself, so your host CLS state stays readable inside
  `@Transactional()`.
