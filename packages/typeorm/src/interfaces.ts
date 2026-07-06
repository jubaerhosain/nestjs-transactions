import {
  TransactionalAsyncOptionsBase,
  TransactionalRootOptionsBase,
} from '@nestjs-transactions/core';
import { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';
import { ModuleMetadata } from '@nestjs/common';
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
export interface TypeOrmTransactionalAsyncOptions
  extends TransactionalAsyncOptionsBase<TypeOrmTransactionalAsyncFactoryResult> {
  dataSource?: DataSourceRef;
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
    return { connectionName: connection, dataSource: connection };
  }
  return {
    connectionName: connection?.connectionName ?? dataSourceName(connection?.dataSource),
    dataSource: connection?.dataSource ?? connection?.connectionName,
  };
}

const DEFAULT_DATA_SOURCE_NAME = 'default';

function dataSourceName(dataSource: DataSourceRef | undefined): string | undefined {
  const name = typeof dataSource === 'string' ? dataSource : dataSource?.name;
  return name === DEFAULT_DATA_SOURCE_NAME ? undefined : name;
}
