// The uniform user-facing surface — identical symbol identity across all
// @nestjs-transactions adapter packages (re-exported from core).
export {
  InjectTransaction,
  InjectTransactionHost,
  Propagation,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
  TransactionPropagationError,
  getTransactionHostToken,
  getTransactionToken,
} from '@nestjs-transactions/core';
export type { Transaction } from '@nestjs-transactions/core';

// Transaction lifecycle hooks — same identity as core (typeorm-transactional parity).
export {
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
} from '@nestjs-transactions/core';

// `Transactional` typed for TypeORM — a single-object API (connectionName,
// propagation, isolationLevel) matching typeorm-transactional's ergonomics.
export { Transactional } from './transactional';
export type { TransactionalOptions } from './transactional';

// The module: forRoot / forRootAsync / forFeature. A unified module that owns
// both the DataSource and transaction propagation — use it INSTEAD of
// @nestjs/typeorm's TypeOrmModule.
export { NestjsTypeormModule } from './nestjs-typeorm.module';
export type {
  DataSourceRef,
  ForFeatureConnection,
  NestjsTypeormRootAsyncOptions,
  NestjsTypeormRootOptions,
} from './interfaces';

// @nestjs/typeorm essentials re-exported (same symbol identity), so apps need
// a single import for the full repository workflow. The deprecated
// InjectConnection/getConnectionToken are deliberately not re-exported.
export {
  InjectDataSource,
  InjectEntityManager,
  InjectRepository,
  getDataSourceToken,
  getEntityManagerToken,
  getRepositoryToken,
} from '@nestjs/typeorm';

// TypeORM-specific extras
export { IsolationLevel } from './isolation-level';
export { provideTransactionAwareRepository } from './repository.provider';
export { TransactionalRepository } from './transactional.repository';

// Advanced: the underlying adapter and a typed TransactionHost alias
export {
  TransactionalAdapterTypeOrm,
  // Concise alias for use in `TransactionHost<TypeOrmAdapter>`. Same symbol
  // identity as `TransactionalAdapterTypeOrm`; the older name stays exported.
  TransactionalAdapterTypeOrm as TypeOrmAdapter,
} from '@nestjs-cls/transactional-adapter-typeorm';
export type { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';
import type { TransactionHost } from '@nestjs-transactions/core';
import type { TransactionalAdapterTypeOrm as _TypeOrmAdapter } from '@nestjs-cls/transactional-adapter-typeorm';
/**
 * Convenience alias for the TypeORM-typed TransactionHost, for use in TYPE
 * positions only (fields, generics, casts). It is erased at runtime, so do
 * NOT use it as a bare constructor-injection annotation — Nest would receive
 * `Object` as the token. Inject with the real class instead:
 * `constructor(txHost: TransactionHost<TypeOrmAdapter>)` or
 * `@InjectTransactionHost('name')`.
 */
export type TypeOrmTransactionHost = TransactionHost<_TypeOrmAdapter>;
