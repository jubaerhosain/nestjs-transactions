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

// Transaction lifecycle hooks — same identity as core.
export {
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
} from '@nestjs-transactions/core';

// `Transactional` typed for Prisma — a single-object API (connectionName,
// propagation, maxWait, timeout, isolationLevel).
export { Transactional } from './transactional';
export type { TransactionalOptions } from './transactional';

// Prisma transaction isolation levels as an ergonomic enum (kept in sync with
// Prisma's own literals by a compile-time guard in the tests — see the file).
export { IsolationLevel } from './isolation-level';

// The module: forRoot / forRootAsync
export { TransactionalModule } from './transactional.module';
export type {
  PrismaTransactionalAsyncOptions,
  PrismaTransactionalOptions,
  PrismaTxOptions,
  SqlFlavor,
} from './interfaces';

// The transaction-aware Prisma client
export {
  getPrismaClientToken,
  InjectPrismaClient,
  provideTransactionAwarePrismaClient,
} from './prisma-client.provider';

// Advanced: the underlying adapter and a typed TransactionHost alias
export {
  TransactionalAdapterPrisma,
  // Concise alias for use in `TransactionHost<PrismaAdapter>`. Same symbol
  // identity as `TransactionalAdapterPrisma`; the longer name stays exported.
  TransactionalAdapterPrisma as PrismaAdapter,
} from '@nestjs-cls/transactional-adapter-prisma';
export type {
  PrismaTransactionalClient,
  PrismaTransactionOptions,
} from '@nestjs-cls/transactional-adapter-prisma';
import type { TransactionHost } from '@nestjs-transactions/core';
import type { TransactionalAdapterPrisma as _PrismaAdapter } from '@nestjs-cls/transactional-adapter-prisma';

// Structural copy of the upstream adapter's (unexported) client constraint.
type AnyTransactionClient = {
  $transaction: (fn: (client: any) => Promise<any>, options?: any) => any;
};

/**
 * Convenience alias for the Prisma-typed TransactionHost, for use in TYPE
 * positions only (fields, generics, casts). It is erased at runtime, so do
 * NOT use it as a bare constructor-injection annotation — Nest would receive
 * `Object` as the token. Inject with the real class instead:
 * `constructor(txHost: TransactionHost<PrismaAdapter>)` or
 * `@InjectTransactionHost('name')`. Pass your generated client type as
 * `TClient` when using a custom output path or an extended client.
 */
export type PrismaTransactionHost<TClient extends AnyTransactionClient = any> = TransactionHost<
  _PrismaAdapter<TClient>
>;
