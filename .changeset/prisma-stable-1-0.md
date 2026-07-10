---
'@nestjs-transactions/prisma': major
---

First stable release of `@nestjs-transactions/prisma` (1.0.0). Inject one transaction-aware Prisma client (`@InjectPrismaClient()`), add `@Transactional()` (object-form options: `connectionName`, `propagation`, `maxWait`, `timeout`, `isolationLevel`), and queries run inside the active interactive transaction — propagated through CLS with no monkey-patching, at full parity with the typeorm adapter.

Includes `TransactionalModule.forRoot`/`forRootAsync`, the transaction lifecycle hooks re-exported from core, a `./testing` no-op module, and a new `IsolationLevel` enum for ergonomic, typo-proof isolation levels.
