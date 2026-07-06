import { Transactional as _Transactional } from '@nestjs-transactions/core';
import type { Propagation } from '@nestjs-transactions/core';
import type { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';

/**
 * `@Transactional` with the TypeORM adapter's options pre-bound. Because the
 * adapter type is baked in, options like `{ isolationLevel }` are fully typed
 * without having to write `@Transactional<TransactionalAdapterTypeOrm>(...)`.
 */
export interface TypeOrmTransactional {
  /** Run in a transaction, optionally with TypeORM options. */
  (options?: TypeOrmTransactionOptions): MethodDecorator;
  /** Run in a transaction with the given propagation mode. */
  (propagation?: Propagation): MethodDecorator;
  /** Run in a transaction on the named connection. */
  (connectionName?: string): MethodDecorator;
  (connectionName: string, options?: TypeOrmTransactionOptions): MethodDecorator;
  (connectionName: string, propagation?: Propagation): MethodDecorator;
  (propagation: Propagation, options?: TypeOrmTransactionOptions): MethodDecorator;
  (
    connectionName: string,
    propagation: Propagation,
    options?: TypeOrmTransactionOptions,
  ): MethodDecorator;
}

/**
 * The uniform `@Transactional` decorator, typed for TypeORM. Same runtime
 * function as core's `Transactional` (identity preserved) — only the option
 * types are specialized, so `@Transactional({ isolationLevel: ... })` needs no
 * type argument.
 */
export const Transactional = _Transactional as TypeOrmTransactional;
