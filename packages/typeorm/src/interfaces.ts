import {
  TransactionalAsyncOptionsBase,
  TransactionalRootOptionsBase,
} from '@nestjs-transactions/core';
import { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';
import { InjectionToken, ModuleMetadata, Provider } from '@nestjs/common';
import type {
  TypeOrmDataSourceFactory,
  TypeOrmModuleOptions as NestTypeOrmModuleOptions,
} from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';

/** How a TypeORM DataSource is referenced — same forms `@nestjs/typeorm` accepts. */
export type DataSourceRef = DataSource | DataSourceOptions | string;

export interface TypeOrmTransactionalOptions extends TransactionalRootOptionsBase {
  /**
   * The DataSource this connection wraps, in any form accepted by
   * `getDataSourceToken()`. Defaults to `connectionName` when that is set
   * (convention: name the connection after the data source), otherwise to the
   * default DataSource.
   */
  dataSource?: DataSourceRef;
  /** Default options merged into every transaction on this connection. */
  defaultTxOptions?: Partial<TypeOrmTransactionOptions>;
  /** Extra modules that export the DataSource token, if it is not globally available. */
  imports?: ModuleMetadata['imports'];
}

export interface TypeOrmTransactionalAsyncFactoryResult {
  defaultTxOptions?: Partial<TypeOrmTransactionOptions>;
}

/**
 * Async variant: `dataSource` (a DI token) and `connectionName` stay static;
 * the factory resolves `defaultTxOptions` at DI time (e.g. from ConfigService).
 */
export interface TypeOrmTransactionalAsyncOptions extends TransactionalAsyncOptionsBase<TypeOrmTransactionalAsyncFactoryResult> {
  dataSource?: DataSourceRef;
}

/**
 * Options of the unified `TypeOrmModule.forRoot()`: everything
 * `@nestjs/typeorm`'s `forRoot` accepts (the module creates the DataSource),
 * plus the transactional options. `name` drives both the DataSource name and
 * the transactional connection name.
 */
export type TypeOrmRootOptions = NestTypeOrmModuleOptions & {
  /** Default options merged into every transaction on this connection. */
  defaultTxOptions?: Partial<TypeOrmTransactionOptions>;
  /**
   * Enables injecting the transaction instance directly with `@InjectTransaction()`.
   *
   * Default: `false`
   */
  enableTransactionProxy?: boolean;
  /**
   * Startup check that fails the boot (`'error'`, the default) or logs
   * (`'warn'`) when plain TypeORM repositories are registered on this
   * DataSource — the classic mix-up of using `TypeOrmModule.forFeature` from
   * `@nestjs/typeorm` (or hand-rolled `Repository` providers), which silently
   * bypass `@Transactional()`. Set `'off'` if unproxied repositories on this
   * connection are intentional.
   *
   * Default: `'error'`
   */
  repositoryConflictCheck?: 'error' | 'warn' | 'off';
};

/**
 * Async variant of {@link TypeOrmRootOptions}: the factory resolves the
 * combined options at DI time. `name` and `enableTransactionProxy` must be
 * static — DI tokens and the CLS plugin are registered at module-definition
 * time, so a `name` returned by the factory is ignored (stripped).
 */
export interface TypeOrmRootAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Name of the DataSource and transactional connection. Must be static. */
  name?: string;
  /** See {@link TypeOrmRootOptions.enableTransactionProxy}. Must be static. */
  enableTransactionProxy?: boolean;
  /**
   * See {@link TypeOrmRootOptions.repositoryConflictCheck}. Must be static —
   * a value returned by the factory is stripped and ignored.
   */
  repositoryConflictCheck?: 'error' | 'warn' | 'off';
  useFactory: (...args: any[]) => Promise<TypeOrmRootOptions> | TypeOrmRootOptions;
  inject?: InjectionToken[];
  /** Extra providers registered alongside the options factory. */
  extraProviders?: Provider[];
  /** Passed through to `@nestjs/typeorm` — custom DataSource instantiation. */
  dataSourceFactory?: TypeOrmDataSourceFactory;
}

/**
 * Second argument of `forFeature`: a plain string sets both the connection
 * name and the data source name (the convention); the object form covers the
 * rare case where they differ.
 */
export type ForFeatureConnection =
  | string
  | {
      connectionName?: string;
      dataSource?: DataSourceRef;
    };

/**
 * The single place the "connectionName and dataSource default to each other"
 * convention lives. Used by forRoot, forRootAsync, forFeature and the testing
 * module so all of them always resolve the same DataSource/TransactionHost pair.
 */
export function resolveConnection(connection?: ForFeatureConnection): {
  connectionName: string | undefined;
  dataSource: DataSourceRef | undefined;
} {
  if (typeof connection === 'string') {
    return { connectionName: normalizeName(connection), dataSource: connection };
  }
  return {
    // The literal 'default' names the default connection — which the underlying
    // TransactionHost token represents as `undefined`, not a named symbol. Run
    // an explicit connectionName through the same normalization as a dataSource
    // name so `{ connectionName: 'default' }` doesn't wire repositories to a
    // never-registered `TransactionHost_default`.
    connectionName:
      connection?.connectionName !== undefined
        ? normalizeName(connection.connectionName)
        : dataSourceName(connection?.dataSource),
    dataSource: connection?.dataSource ?? connection?.connectionName,
  };
}

const DEFAULT_DATA_SOURCE_NAME = 'default';

/** Map the literal 'default' name to `undefined` (the default connection). */
export function normalizeName(name: string | undefined): string | undefined {
  return name === DEFAULT_DATA_SOURCE_NAME ? undefined : name;
}

function dataSourceName(dataSource: DataSourceRef | undefined): string | undefined {
  return normalizeName(typeof dataSource === 'string' ? dataSource : dataSource?.name);
}
