---
'@nestjs-transactions/typeorm': major
---

**Breaking:** the two-module setup (`@nestjs/typeorm`'s `TypeOrmModule` + this package's `TransactionalModule`) is merged into a single unified `TypeOrmModule` exported from this package.

- `TransactionalModule` is removed from the public surface. Use `TypeOrmModule.forRoot()` / `forRootAsync()` / `forFeature()` instead — same shape as `@nestjs/typeorm`'s module (full options passthrough, including `autoLoadEntities` and `retryAttempts`), plus the transactional options `defaultTxOptions` and `enableTransactionProxy`. `name` names both the DataSource and the transactional connection.
- `InjectRepository`, `InjectDataSource`, `InjectEntityManager` and the token helpers are re-exported from `@nestjs/typeorm` (same symbols), so a single import covers the whole workflow.
- Removed: attaching to an externally managed DataSource via `TransactionalModule.forRoot({ dataSource, imports })` — `forRoot` now always owns the DataSource.
- Guided bootstrap error: if `forFeature` repositories are wired to a transactional connection that was never registered (the classic mix-up — `TypeOrmModule.forRoot()` imported from `@nestjs/typeorm` instead of this package), startup now fails with an error explaining the wrong import instead of Nest's generic unresolved-dependency message.
- Migration: change the `TypeOrmModule` import line to `@nestjs-transactions/typeorm`, delete `TransactionalModule.forRoot(...)` (move `defaultTxOptions`/`enableTransactionProxy` into `forRoot`), and rename `TransactionalModule.forFeature(...)` to `TypeOrmModule.forFeature(...)`.
