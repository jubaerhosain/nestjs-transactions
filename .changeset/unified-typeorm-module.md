---
'@nestjs-transactions/typeorm': major
---

**Breaking:** the two-module setup (`@nestjs/typeorm`'s `TypeOrmModule` + this package's `TransactionalModule`) is merged into a single unified `NestjsTypeormModule` exported from this package.

- `TransactionalModule` is removed from the public surface. Use `NestjsTypeormModule.forRoot()` / `forRootAsync()` / `forFeature()` instead — same shape as `@nestjs/typeorm`'s module (full options passthrough, including `autoLoadEntities` and `retryAttempts`), plus the transactional options `defaultTxOptions` and `enableTransactionProxy`. `name` names both the DataSource and the transactional connection.
- `InjectRepository`, `InjectDataSource`, `InjectEntityManager` and the token helpers are re-exported from `@nestjs/typeorm` (same symbols), so a single import covers the whole workflow.
- Removed: attaching to an externally managed DataSource via `TransactionalModule.forRoot({ dataSource, imports })` — `forRoot` now always owns the DataSource.
- Migration: replace `import { TypeOrmModule } from '@nestjs/typeorm'` + `import { TransactionalModule } from '@nestjs-transactions/typeorm'` with a single `import { NestjsTypeormModule } from '@nestjs-transactions/typeorm'`; delete `TransactionalModule.forRoot(...)` (move `defaultTxOptions`/`enableTransactionProxy` into `NestjsTypeormModule.forRoot(...)`), and rename both packages' `forFeature(...)` to `NestjsTypeormModule.forFeature(...)`.
