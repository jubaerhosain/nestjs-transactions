import { DynamicModule } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { createTransactionalModule } from '@nestjs-transactions/core';
import {
  TransactionalAdapterTypeOrm,
  TypeOrmTransactionOptions,
} from '@nestjs-cls/transactional-adapter-typeorm';
import { DataSource } from 'typeorm';
import {
  resolveConnection,
  TypeOrmTransactionalAsyncFactoryResult,
  TypeOrmTransactionalAsyncOptions,
  TypeOrmTransactionalOptions,
} from './interfaces';

const ASYNC_OPTIONS_TOKEN = Symbol('TYPEORM_TRANSACTIONAL_ASYNC_OPTIONS');

/**
 * TransactionalAdapterTypeOrm whose `defaultTxOptions` are resolved through DI
 * (the plugin passes providers listed in `extraProviderTokens` to
 * `optionsFactory`, and reads `defaultTxOptions` right after calling it).
 */
class AsyncOptionsTypeOrmAdapter extends TransactionalAdapterTypeOrm {
  extraProviderTokens = [ASYNC_OPTIONS_TOKEN];

  constructor(dataSourceToken: any) {
    super({ dataSourceToken });
    const original = this.optionsFactory;
    this.optionsFactory = (dataSource: DataSource, extraProviders?: any[]) => {
      const resolved = extraProviders?.[0] as TypeOrmTransactionalAsyncFactoryResult | undefined;
      // Assign unconditionally: the plugin reads defaultTxOptions synchronously
      // right after this call, and the adapter instance is shared across app
      // compiles of the same module — a conditional assignment would leak one
      // app's options into the next.
      this.defaultTxOptions = resolved?.defaultTxOptions as
        Partial<TypeOrmTransactionOptions> | undefined;
      return original(dataSource);
    };
  }
}

const TransactionalModuleBase = createTransactionalModule<
  TypeOrmTransactionalOptions,
  TypeOrmTransactionalAsyncOptions
>({
  adapterFactory: (options) => ({
    adapter: new TransactionalAdapterTypeOrm({
      dataSourceToken: getDataSourceToken(options.dataSource),
      defaultTxOptions: options.defaultTxOptions,
    }),
    imports: options.imports,
  }),
  asyncAdapterFactory: (options) => ({
    adapter: new AsyncOptionsTypeOrmAdapter(getDataSourceToken(options.dataSource)),
    providers: [
      {
        provide: ASYNC_OPTIONS_TOKEN,
        useFactory: options.useFactory,
        inject: options.inject,
      },
    ],
  }),
});

/**
 * INTERNAL — the transaction-propagation half of the public unified
 * `NestjsTypeormModule` (`src/nestjs-typeorm.module.ts`), which composes this
 * module with `@nestjs/typeorm`'s. Not exported from the package; it wires the
 * CLS transactional plugin against an already-registered DataSource token.
 */
export class TransactionalModule extends TransactionalModuleBase {
  static override forRoot(options: TypeOrmTransactionalOptions = {}): DynamicModule {
    return super.forRoot(withResolvedConnection(options));
  }

  static override forRootAsync(options: TypeOrmTransactionalAsyncOptions): DynamicModule {
    return super.forRootAsync(withResolvedConnection(options));
  }
}

/**
 * Apply the bidirectional connectionName↔dataSource defaulting once, before the
 * base class registers the CLS plugin, so `forRoot({ dataSource: 'stats' })`
 * registers the NAMED connection 'stats' rather than the default one, and the
 * adapter factories can read `options.dataSource` directly. (`getDataSourceToken`
 * maps both `undefined` and the literal 'default' to the default token, so the
 * un-normalized dataSource is safe to pass through.)
 */
function withResolvedConnection<
  T extends TypeOrmTransactionalOptions | TypeOrmTransactionalAsyncOptions,
>(options: T): T {
  const { connectionName, dataSource } = resolveConnection(options);
  return { ...options, connectionName, dataSource };
}
