import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { createTransactionalModule } from '@nestjs-transactional/core';
import {
  TransactionalAdapterTypeOrm,
  TypeOrmTransactionOptions,
} from '@nestjs-cls/transactional-adapter-typeorm';
import { DataSource } from 'typeorm';
import {
  ForFeatureConnection,
  TypeOrmTransactionalAsyncFactoryResult,
  TypeOrmTransactionalAsyncOptions,
  TypeOrmTransactionalOptions,
} from './interfaces';
import { provideTransactionAwareRepository } from './repository.provider';

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
      if (resolved?.defaultTxOptions) {
        this.defaultTxOptions = resolved.defaultTxOptions as Partial<TypeOrmTransactionOptions>;
      }
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
      dataSourceToken: getDataSourceToken(options.dataSource ?? options.connectionName),
      defaultTxOptions: options.defaultTxOptions,
    }),
    imports: options.imports,
  }),
  asyncAdapterFactory: (options) => ({
    adapter: new AsyncOptionsTypeOrmAdapter(
      getDataSourceToken(options.dataSource ?? options.connectionName),
    ),
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
    const providers = entities.map((entity) =>
      provideTransactionAwareRepository(entity, connection),
    );
    return {
      module: TransactionalModule,
      providers,
      exports: providers.map((provider) => (provider as FactoryProvider).provide),
    };
  }
}
