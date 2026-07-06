import { DynamicModule } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { createTransactionalModule } from '@nestjs-transactions/core';
import {
  TransactionalAdapterTypeOrm,
  TypeOrmTransactionOptions,
} from '@nestjs-cls/transactional-adapter-typeorm';
import { DataSource } from 'typeorm';
import {
  ForFeatureConnection,
  resolveConnection,
  TypeOrmTransactionalAsyncFactoryResult,
  TypeOrmTransactionalAsyncOptions,
  TypeOrmTransactionalOptions,
} from './interfaces';
import { buildFeatureProviders } from './repository.provider';

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
        | Partial<TypeOrmTransactionOptions>
        | undefined;
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
      dataSourceToken: getDataSourceToken(resolveConnection(options).dataSource),
      defaultTxOptions: options.defaultTxOptions,
    }),
    imports: options.imports,
  }),
  asyncAdapterFactory: (options) => ({
    adapter: new AsyncOptionsTypeOrmAdapter(getDataSourceToken(resolveConnection(options).dataSource)),
    providers: [
      {
        provide: ASYNC_OPTIONS_TOKEN,
        useFactory: options.useFactory,
        inject: options.inject,
      },
    ],
  }),
});

export class TransactionalModule extends TransactionalModuleBase {
  static override forRoot(options: TypeOrmTransactionalOptions = {}): DynamicModule {
    return super.forRoot(withResolvedConnection(options));
  }

  static override forRootAsync(options: TypeOrmTransactionalAsyncOptions): DynamicModule {
    return super.forRootAsync(withResolvedConnection(options));
  }

  /**
   * Register transaction-aware repositories for the given entities under the
   * standard `@InjectRepository` tokens. Use instead of
   * `TypeOrmModule.forFeature()` for these entities — do not use both for the
   * same entity in the same module.
   */
  static forFeature(
    entities: EntityClassOrSchema[],
    connection?: ForFeatureConnection,
  ): DynamicModule {
    const { providers, exports } = buildFeatureProviders(entities, connection);
    return {
      module: TransactionalModule,
      providers,
      exports,
    };
  }
}

/**
 * Apply the bidirectional connectionName↔dataSource defaulting before the base
 * class registers the CLS plugin, so `forRoot({ dataSource: 'stats' })`
 * registers the NAMED connection 'stats' rather than the default one.
 */
function withResolvedConnection<T extends TypeOrmTransactionalOptions | TypeOrmTransactionalAsyncOptions>(
  options: T,
): T {
  return { ...options, connectionName: resolveConnection(options).connectionName };
}
