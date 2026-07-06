import { InjectionToken, ModuleMetadata, Provider } from '@nestjs/common';
import { TransactionalAdapter } from '@nestjs-cls/transactional';

/**
 * Options common to every adapter's `TransactionalModule.forRoot()`.
 */
export interface TransactionalRootOptionsBase {
  /**
   * Name of this connection. Register one `TransactionalModule.forRoot()` per
   * connection and select it with `@Transactional('name')`,
   * `@InjectTransactionHost('name')` or `@InjectTransaction('name')`.
   *
   * Omit for the (single) default connection.
   */
  connectionName?: string;
  /**
   * Enables injecting the transaction instance directly with `@InjectTransaction()`.
   *
   * Default: `false`
   */
  enableTransactionProxy?: boolean;
}

/**
 * What an adapter package contributes to the module produced by
 * {@link TransactionalModuleDefinition.adapterFactory}.
 */
export interface AdapterRegistration {
  /** The `@nestjs-cls/transactional` adapter instance for this ORM. */
  adapter: TransactionalAdapter<any, any, any>;
  /** Modules that export providers the adapter needs (e.g. the module exporting a DataSource token). */
  imports?: ModuleMetadata['imports'];
  /** Extra providers the adapter package wants registered alongside the plugin. */
  providers?: Provider[];
  /** Tokens from `providers` to export from the produced module. */
  exports?: any[];
}

/**
 * Nest-standard async options: the factory resolves the adapter-specific part
 * of the options at DI time. `connectionName` and `enableTransactionProxy`
 * must be static because the CLS plugin is registered at module-definition time.
 */
export interface TransactionalAsyncOptionsBase<TFactoryResult>
  extends Pick<ModuleMetadata, 'imports'>,
    TransactionalRootOptionsBase {
  useFactory: (...args: any[]) => Promise<TFactoryResult> | TFactoryResult;
  inject?: InjectionToken[];
}

/**
 * The contract an adapter package fulfills to obtain its own `TransactionalModule`
 * via `createTransactionalModule()`. This is the whole adapter-author SPI —
 * no ORM concept (entity, repository, client) appears in it.
 */
export interface TransactionalModuleDefinition<
  TOptions extends TransactionalRootOptionsBase,
  TAsyncOptions extends TransactionalAsyncOptionsBase<any> = TransactionalAsyncOptionsBase<any>,
> {
  adapterFactory: (options: TOptions) => AdapterRegistration;
  /**
   * Like `adapterFactory`, but for `forRootAsync`. The adapter must defer
   * consumption of factory-resolved values to DI time (e.g. via
   * `extraProviderTokens` on the adapter). Omit to make `forRootAsync` throw.
   */
  asyncAdapterFactory?: (options: TAsyncOptions) => AdapterRegistration;
}
