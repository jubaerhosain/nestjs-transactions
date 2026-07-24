import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import {
  ForFeatureConnection,
  NestjsTypeormRootAsyncOptions,
  NestjsTypeormRootOptions,
  normalizeName,
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
   * replaced with the static one (DI tokens are computed at module-definition
   * time).
   */
  static forRootAsync(options: NestjsTypeormRootAsyncOptions): DynamicModule {
    // Unique per registration (shared across both halves via this closure), so
    // it can never collide with another root's options provider or a user token.
    const token = Symbol(`nestjs-transactions:typeorm-options:${options.name ?? 'default'}`);
    // A FRESH holder class per registration. Nest identifies a dynamic module
    // by its module class plus metadata — by object reference by default, but
    // under `moduleIdGeneratorAlgorithm: 'deep-hash'` by a metadata hash keyed
    // per class, where two registrations with byte-identical factory bodies
    // would collapse into ONE module (the second connection silently reusing
    // the first's options). A unique class makes each registration's identity
    // unique under either algorithm.
    const OptionsHolderModule = class TypeOrmOptionsHolderModule {};
    // ONE shared dynamic module holds the user factory; it is imported by both
    // consumers below, so they collapse to a single module instance and the
    // user factory runs exactly once per application.
    const optionsModule: DynamicModule = {
      module: OptionsHolderModule,
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
          useFactory: (combined: NestjsTypeormRootOptions) =>
            stripTxOptions(combined, options.name),
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
    assertUnifiedConnection(connection);
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

/**
 * The unified module always names the transactional connection after the
 * DataSource (`forRoot({ name })` sets both), so a `forFeature` whose
 * `connectionName` differs from its `dataSource` injects a `TransactionHost`
 * token that `forRoot` never registers — a generic "can't resolve
 * dependencies" failure at startup. Reject that split form here with a guided
 * message. (The single-key object forms and the string form default one side
 * to the other, so they never trip this.)
 */
function assertUnifiedConnection(connection?: ForFeatureConnection): void {
  if (connection === null || typeof connection !== 'object') {
    return;
  }
  // `@nestjs/typeorm`'s forFeature takes a raw DataSource/DataSourceOptions as
  // its second argument; ours takes it wrapped as `{ dataSource }`. A raw
  // object (untyped callers — TypeScript rejects it) carries neither of our
  // keys and would silently resolve to the DEFAULT connection, so reject any
  // object with foreign keys only. (A bare `{}` is equivalent to omitting the
  // argument and stays allowed.)
  if (!('connectionName' in connection) && !('dataSource' in connection)) {
    if (Object.keys(connection).length > 0) {
      throw new Error(
        `NestjsTypeormModule.forFeature received an object with neither 'connectionName' nor ` +
          `'dataSource' — it would silently bind to the default connection. Pass the connection ` +
          `as a string name, or wrap a DataSource/DataSourceOptions as { dataSource: ... }.`,
      );
    }
    return;
  }
  const { connectionName, dataSource } = connection;
  if (connectionName === undefined || dataSource === undefined) {
    return;
  }
  const cn = normalizeName(connectionName);
  const dsName = normalizeName(typeof dataSource === 'string' ? dataSource : dataSource.name);
  if (cn !== dsName) {
    throw new Error(
      `NestjsTypeormModule.forFeature was given connectionName '${connectionName}' and dataSource ` +
        `'${dsName ?? 'default'}', but the unified module always names the transactional connection ` +
        `after the DataSource, so a split connection is not supported here. Use a single name ` +
        `(string, or one key of the object form), or, for a genuinely split hand-wired setup, ` +
        `register providers with provideTransactionAwareRepository directly.`,
    );
  }
}

/**
 * Remove the transactional keys `@nestjs/typeorm` must not see, and force
 * `name` to the static outer value: `name` must be static on the outer async
 * options (tokens are computed at module-definition time), so a
 * factory-returned `name` would silently disagree with the registered tokens.
 * It cannot simply be deleted either — `TypeOrmCoreModule.onApplicationShutdown`
 * resolves the DataSource token from these RESOLVED options (Nest never merges
 * the static `name` back in), so a named connection would fail to shut down.
 */
function stripTxOptions(
  combined: NestjsTypeormRootOptions,
  staticName: string | undefined,
): TypeOrmModuleOptions {
  const ormOptions: NestjsTypeormRootOptions = { ...combined };
  delete ormOptions.defaultTxOptions;
  delete ormOptions.enableTransactionProxy;
  if (staticName === undefined) {
    delete ormOptions.name;
  } else {
    ormOptions.name = staticName;
  }
  return ormOptions as TypeOrmModuleOptions;
}
