import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import {
  ForFeatureConnection,
  NestjsTypeormRootAsyncOptions,
  NestjsTypeormRootOptions,
  resolveConnection,
} from './interfaces';
import { buildFeatureProviders } from './repository.provider';
import { TransactionalModule } from './transactional.module';

/**
 * The single module of `@nestjs-transactions/typeorm` — a unified module that
 * owns BOTH the database connection and transaction propagation. Import this
 * *instead of* `@nestjs/typeorm`'s `TypeOrmModule`: `forRoot()` creates the
 * DataSource (delegating to `@nestjs/typeorm`) *and* registers the
 * transactional plugin; `forFeature()` registers transaction-aware
 * repositories under the standard `@InjectRepository` tokens.
 *
 * ```ts
 * import { NestjsTypeormModule } from '@nestjs-transactions/typeorm';
 *
 * imports: [
 *   NestjsTypeormModule.forRoot({ type: 'postgres', ..., defaultTxOptions: {...} }),
 *   NestjsTypeormModule.forFeature([Member]),
 * ]
 * ```
 */
export class NestjsTypeormModule {
  /**
   * Create the DataSource (all `@nestjs/typeorm` options accepted, including
   * `autoLoadEntities`, `retryAttempts`, `name`, …) and register transaction
   * propagation for it. `name` names both the DataSource and the
   * transactional connection.
   */
  static forRoot(options: NestjsTypeormRootOptions = {}): DynamicModule {
    // Strip the transactional keys — unknown keys must not reach `new DataSource()`.
    const { defaultTxOptions, enableTransactionProxy, ...ormOptions } = options;
    return {
      module: NestjsTypeormModule,
      imports: [
        TypeOrmModule.forRoot(ormOptions as TypeOrmModuleOptions),
        // `withResolvedConnection` normalizes the literal 'default' and the
        // connectionName↔dataSource defaulting.
        TransactionalModule.forRoot({
          connectionName: ormOptions.name,
          dataSource: ormOptions.name,
          defaultTxOptions,
          enableTransactionProxy,
        }),
      ],
    };
  }

  /**
   * Async variant: the factory resolves the combined options (DataSource +
   * `defaultTxOptions`) at DI time. `name` and `enableTransactionProxy` must
   * be static on the outer options — a `name` returned by the factory is
   * stripped (DI tokens are computed at module-definition time).
   */
  static forRootAsync(options: NestjsTypeormRootAsyncOptions): DynamicModule {
    const token = combinedOptionsToken(options.name);
    // ONE shared dynamic module holds the user factory; it is imported by both
    // consumers below. Nest derives a module's identity from the module class
    // plus its metadata, so both imports collapse to a single module instance
    // and the user factory runs exactly once per application.
    const optionsModule: DynamicModule = {
      module: TypeOrmOptionsHolderModule,
      imports: options.imports,
      providers: [
        { provide: token, useFactory: options.useFactory, inject: options.inject },
        ...(options.extraProviders ?? []),
      ],
      exports: [token],
    };
    return {
      module: NestjsTypeormModule,
      imports: [
        TypeOrmModule.forRootAsync({
          name: options.name,
          imports: [optionsModule],
          inject: [token],
          useFactory: (combined: NestjsTypeormRootOptions) => stripTxOptions(combined),
          dataSourceFactory: options.dataSourceFactory,
        }),
        TransactionalModule.forRootAsync({
          connectionName: options.name,
          dataSource: options.name,
          enableTransactionProxy: options.enableTransactionProxy,
          imports: [optionsModule],
          inject: [token],
          useFactory: (combined: NestjsTypeormRootOptions) => ({
            defaultTxOptions: combined.defaultTxOptions,
          }),
        }),
      ],
    };
  }

  /**
   * Register transaction-aware repositories for the given entities under the
   * standard `@InjectRepository` tokens. Use *instead of* `forFeature()` from
   * `@nestjs/typeorm` — do not use both for the same entity in the same module.
   */
  static forFeature(
    entities: EntityClassOrSchema[],
    connection?: ForFeatureConnection,
  ): DynamicModule {
    const { providers, exports } = buildFeatureProviders(entities, connection);
    const { dataSource } = resolveConnection(connection);
    return {
      module: NestjsTypeormModule,
      // Import @nestjs/typeorm's forFeature for its side effect: it feeds
      // EntitiesMetadataStorage, which is what makes `autoLoadEntities: true`
      // pick these entities up. Its plain repository providers stay buried in
      // that module as harmless dead providers — our transaction-aware
      // providers below register the same tokens on THIS module, and Nest
      // resolves a module's own providers before its imports' exports.
      imports: [TypeOrmModule.forFeature(entities, dataSource ?? 'default')],
      providers,
      exports,
    };
  }
}

/** Host class for the shared async-options module (see `forRootAsync`). */
class TypeOrmOptionsHolderModule {}

/**
 * Token for the DI-resolved combined options, scoped by connection name so
 * two `forRootAsync` registrations don't collide.
 */
function combinedOptionsToken(name: string | undefined): string {
  return `NESTJS_TRANSACTIONS_TYPEORM_OPTIONS_${name ?? 'default'}`;
}

/**
 * Remove the keys `@nestjs/typeorm` must not see: the transactional options,
 * and `name` — the name must be static on the outer async options (tokens are
 * computed at module-definition time), so a factory-returned `name` would
 * silently disagree with the registered tokens.
 */
function stripTxOptions(combined: NestjsTypeormRootOptions): TypeOrmModuleOptions {
  const ormOptions: NestjsTypeormRootOptions = { ...combined };
  delete ormOptions.defaultTxOptions;
  delete ormOptions.enableTransactionProxy;
  // Static-only option: a `name` returned by the async factory is ignored.
  delete ormOptions.name;
  return ormOptions as TypeOrmModuleOptions;
}
