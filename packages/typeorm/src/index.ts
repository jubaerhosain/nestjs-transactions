// The uniform user-facing surface — identical symbol identity across all
// @nestjs-transactions adapter packages (re-exported from core).
export {
  InjectTransaction,
  InjectTransactionHost,
  Propagation,
  Transactional,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
  TransactionPropagationError,
  getTransactionHostToken,
  getTransactionToken,
} from '@nestjs-transactions/core';
export type { Transaction } from '@nestjs-transactions/core';

// The module: forRoot / forRootAsync / forFeature
export { TransactionalModule } from './transactional.module';
export type {
  DataSourceRef,
  ForFeatureConnection,
  TypeOrmTransactionalAsyncOptions,
  TypeOrmTransactionalOptions,
} from './interfaces';

// TypeORM-specific extras
export { IsolationLevel } from './isolation-level';
export { provideTransactionAwareRepository } from './repository.provider';
export { TransactionAwareRepository } from './transaction-aware.repository';

// Advanced: the underlying adapter and a typed TransactionHost alias
export { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
export type { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';
import type { TransactionHost } from '@nestjs-transactions/core';
import type { TransactionalAdapterTypeOrm as _TypeOrmAdapter } from '@nestjs-cls/transactional-adapter-typeorm';
/**
 * Convenience alias for the TypeORM-typed TransactionHost, for use in TYPE
 * positions only (fields, generics, casts). It is erased at runtime, so do
 * NOT use it as a bare constructor-injection annotation — Nest would receive
 * `Object` as the token. Inject with the real class instead:
 * `constructor(txHost: TransactionHost<TransactionalAdapterTypeOrm>)` or
 * `@InjectTransactionHost('name')`.
 */
export type TypeOrmTransactionHost = TransactionHost<_TypeOrmAdapter>;
