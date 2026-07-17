import { DynamicModule, Provider } from '@nestjs/common';
import { TypeOrmModule as NestTypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import {
  ForFeatureConnection,
  normalizeName,
  resolveConnection,
  TypeOrmRootAsyncOptions,
  TypeOrmRootOptions,
} from './interfaces';
import { provideRepositoryConflictChecker } from './repository-conflict-checker';
import { buildFeatureProviders } from './repository.provider';
import { TransactionalModule } from './transactional.module';

/**
 * The single module of `@nestjs-transactions/typeorm` — a drop-in replacement
 * for `@nestjs/typeorm`'s `TypeOrmModule` that also owns transaction
 * propagation. `forRoot()` creates the DataSource (delegating to
 * `@nestjs/typeorm`) *and* registers the transactional plugin; `forFeature()`
 * registers transaction-aware repositories under the standard
 * `@InjectRepository` tokens.
 *
 * ```ts
 * import { TypeOrmModule } from '@nestjs-transactions/typeorm';
 *
 * imports: [
 *   TypeOrmModule.forRoot({ type: 'postgres', ..., defaultTxOptions: {...} }),
 *   TypeOrmModule.forFeature([Member]),
 * ]
 * ```
 *
 * Use it *instead of* (never alongside) `@nestjs/typeorm`'s module of the
 * same name — just change the import line.
 */
export class TypeOrmModule {
  /**
   * Create the DataSource (all `@nestjs/typeorm` options accepted, including
   * `autoLoadEntities`, `retryAttempts`, `name`, …) and register transaction
   * propagation for it. `name` names both the DataSource and the
   * transactional connection.
   */
  static forRoot(options: TypeOrmRootOptions = {}): DynamicModule {
    // Strip the transactional keys — unknown keys must not reach `new DataSource()`.
    const { defaultTxOptions, enableTransactionProxy, repositoryConflictCheck, ...ormOptions } =
      options;
    return {
      module: TypeOrmModule,
      imports: [
        NestTypeOrmModule.forRoot(ormOptions as TypeOrmModuleOptions),
        // `withResolvedConnection` normalizes the literal 'default' and the
        // connectionName↔dataSource defaulting.
        TransactionalModule.forRoot({
          connectionName: ormOptions.name,
          dataSource: ormOptions.name,
          defaultTxOptions,
          enableTransactionProxy,
        }),
      ],
      providers: conflictCheckerProviders(ormOptions.name, repositoryConflictCheck),
    };
  }

  /**
   * Async variant: the factory resolves the combined options (DataSource +
   * `defaultTxOptions`) at DI time. `name` and `enableTransactionProxy` must
   * be static on the outer options — a `name` returned by the factory is
   * stripped (DI tokens are computed at module-definition time).
   */
  static forRootAsync(options: TypeOrmRootAsyncOptions): DynamicModule {
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
      module: TypeOrmModule,
      imports: [
        NestTypeOrmModule.forRootAsync({
          name: options.name,
          imports: [optionsModule],
          inject: [token],
          useFactory: (combined: TypeOrmRootOptions) => stripTxOptions(combined),
          dataSourceFactory: options.dataSourceFactory,
        }),
        TransactionalModule.forRootAsync({
          connectionName: options.name,
          dataSource: options.name,
          enableTransactionProxy: options.enableTransactionProxy,
          imports: [optionsModule],
          inject: [token],
          useFactory: (combined: TypeOrmRootOptions) => ({
            defaultTxOptions: combined.defaultTxOptions,
          }),
        }),
      ],
      providers: conflictCheckerProviders(options.name, options.repositoryConflictCheck),
    };
  }

  /**
   * Register transaction-aware repositories for the given entities under the
   * standard `@InjectRepository` tokens. Drop-in replacement for
   * `TypeOrmModule.forFeature()` from `@nestjs/typeorm` — do not use both for
   * the same entity in the same module.
   */
  static forFeature(
    entities: EntityClassOrSchema[],
    connection?: ForFeatureConnection,
  ): DynamicModule {
    const { providers, exports } = buildFeatureProviders(entities, connection);
    const { dataSource } = resolveConnection(connection);
    return {
      module: TypeOrmModule,
      // Import @nestjs/typeorm's forFeature for its side effect: it feeds
      // EntitiesMetadataStorage, which is what makes `autoLoadEntities: true`
      // pick these entities up. Its plain repository providers stay buried in
      // that module as harmless dead providers — our transaction-aware
      // providers below register the same tokens on THIS module, and Nest
      // resolves a module's own providers before its imports' exports.
      imports: [NestTypeOrmModule.forFeature(entities, dataSource ?? 'default')],
      providers,
      exports,
    };
  }
}

/** Host class for the shared async-options module (see `forRootAsync`). */
class TypeOrmOptionsHolderModule {}

/**
 * The mixed-import guard for one connection (see `repository-conflict-checker.ts`),
 * unless opted out with `repositoryConflictCheck: 'off'`. Static option: in
 * `forRootAsync` it must live on the outer options, not the factory result.
 */
function conflictCheckerProviders(
  name: string | undefined,
  severity: 'error' | 'warn' | 'off' = 'error',
): Provider[] {
  if (severity === 'off') {
    return [];
  }
  return [provideRepositoryConflictChecker(normalizeName(name), severity)];
}

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
function stripTxOptions(combined: TypeOrmRootOptions): TypeOrmModuleOptions {
  const ormOptions: TypeOrmRootOptions = { ...combined };
  delete ormOptions.defaultTxOptions;
  delete ormOptions.enableTransactionProxy;
  // Static-only options: values returned by the async factory are ignored.
  delete ormOptions.repositoryConflictCheck;
  delete ormOptions.name;
  return ormOptions as TypeOrmModuleOptions;
}
