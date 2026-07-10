# @nestjs-transactions/prisma

## 1.0.0

### Major Changes

- [#16](https://github.com/jubaerhosain/nestjs-transactions/pull/16) [`e33c085`](https://github.com/jubaerhosain/nestjs-transactions/commit/e33c0857c14057ea9239aa6c478abd2b3b77ab8b) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - First stable release of `@nestjs-transactions/prisma` (1.0.0). Inject one transaction-aware Prisma client (`@InjectPrismaClient()`), add `@Transactional()` (object-form options: `connectionName`, `propagation`, `maxWait`, `timeout`, `isolationLevel`), and queries run inside the active interactive transaction — propagated through CLS with no monkey-patching, at full parity with the typeorm adapter.

  Includes `TransactionalModule.forRoot`/`forRootAsync`, the transaction lifecycle hooks re-exported from core, a `./testing` no-op module, and a new `IsolationLevel` enum for ergonomic, typo-proof isolation levels.
