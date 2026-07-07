---
'@nestjs-transactions/prisma': minor
---

New package: `@nestjs-transactions/prisma` — a prototype Prisma adapter. Inject one transaction-aware Prisma client (`@InjectPrismaClient()`), add `@Transactional()` (object-form options: `connectionName`, `propagation`, `maxWait`, `timeout`, `isolationLevel`), and queries silently run inside the active interactive transaction. Includes `TransactionalModule.forRoot`/`forRootAsync`, transaction lifecycle hooks re-exported from core, and a `./testing` no-op module.
