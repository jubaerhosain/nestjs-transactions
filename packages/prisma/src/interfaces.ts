import {
  TransactionalAsyncOptionsBase,
  TransactionalRootOptionsBase,
} from '@nestjs-transactions/core';
import {
  PrismaTransactionalAdapterOptions,
  PrismaTransactionOptions,
} from '@nestjs-cls/transactional-adapter-prisma';
import { InjectionToken, ModuleMetadata } from '@nestjs/common';

/**
 * The SQL dialect of the underlying database, e.g. `'postgresql'`. Required
 * for `Propagation.NESTED` support (savepoints are emulated with raw SQL and
 * Prisma cannot introspect the dialect at runtime). Derived from the adapter's
 * option because the upstream package does not export the union directly.
 */
export type SqlFlavor = NonNullable<PrismaTransactionalAdapterOptions['sqlFlavor']>;

/**
 * Options native to Prisma's interactive `$transaction` — `maxWait`, `timeout`
 * and `isolationLevel`. Note Prisma's default `timeout` is 5 seconds; raise it
 * here (per call) or via `defaultTxOptions` for long-running transactions.
 */
export type PrismaTxOptions = Partial<NonNullable<PrismaTransactionOptions>>;

export interface PrismaTransactionalOptions extends TransactionalRootOptionsBase {
  /**
   * The DI token the application's `PrismaClient` instance is provided under —
   * typically a `PrismaService` class extending the generated `PrismaClient`,
   * or a string/symbol token for extended clients.
   */
  prismaToken: InjectionToken;
  /** Enables `Propagation.NESTED` (savepoints). Omit for NoSQL databases. */
  sqlFlavor?: SqlFlavor;
  /** Default options merged into every transaction on this connection. */
  defaultTxOptions?: PrismaTxOptions;
  /** Extra modules that export `prismaToken`, if it is not globally available. */
  imports?: ModuleMetadata['imports'];
}

export interface PrismaTransactionalAsyncFactoryResult {
  defaultTxOptions?: PrismaTxOptions;
}

/**
 * Async variant: `prismaToken`, `sqlFlavor` and `connectionName` stay static;
 * the factory resolves `defaultTxOptions` at DI time (e.g. from ConfigService).
 */
export interface PrismaTransactionalAsyncOptions extends TransactionalAsyncOptionsBase<PrismaTransactionalAsyncFactoryResult> {
  prismaToken: InjectionToken;
  sqlFlavor?: SqlFlavor;
}

const DEFAULT_CONNECTION_NAME = 'default';

/** Map the literal 'default' name to `undefined` (the default connection). */
export function normalizeName(name: string | undefined): string | undefined {
  return name === DEFAULT_CONNECTION_NAME ? undefined : name;
}
