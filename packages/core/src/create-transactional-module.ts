import { DynamicModule, Type } from '@nestjs/common';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { ClsModule } from 'nestjs-cls';
import {
  AdapterRegistration,
  TransactionalAsyncOptionsBase,
  TransactionalModuleDefinition,
  TransactionalRootOptionsBase,
} from './interfaces';
import { applyTransactionHooks } from './transaction-hooks';

export interface TransactionalModuleBaseClass<
  TOptions extends TransactionalRootOptionsBase,
  TAsyncOptions extends TransactionalAsyncOptionsBase<any>,
> {
  new (): object;
  forRoot(options?: TOptions): DynamicModule;
  forRootAsync(options: TAsyncOptions): DynamicModule;
}

/**
 * Produce a `TransactionalModule` base class for an adapter package.
 *
 * The adapter package extends the returned class (optionally adding statics
 * like `forFeature`) and its users get `forRoot`/`forRootAsync` that wire the
 * `@nestjs-cls/transactional` plugin via `ClsModule.registerPlugins` — never
 * `ClsModule.forRoot()`, so it composes with a host app's own CLS setup.
 */
export function createTransactionalModule<
  TOptions extends TransactionalRootOptionsBase,
  TAsyncOptions extends TransactionalAsyncOptionsBase<any> = TransactionalAsyncOptionsBase<any>,
>(
  definition: TransactionalModuleDefinition<TOptions, TAsyncOptions>,
): TransactionalModuleBaseClass<TOptions, TAsyncOptions> {
  class TransactionalModuleBase {
    static forRoot(options: TOptions = {} as TOptions): DynamicModule {
      const registration = definition.adapterFactory(options);
      return buildDynamicModule(this, options, registration);
    }

    static forRootAsync(options: TAsyncOptions): DynamicModule {
      if (!definition.asyncAdapterFactory) {
        throw new Error(`${this.name}.forRootAsync() is not supported by this adapter.`);
      }
      const registration = definition.asyncAdapterFactory(options);
      return buildDynamicModule(this, options, registration, options.imports);
    }
  }
  return TransactionalModuleBase as TransactionalModuleBaseClass<TOptions, TAsyncOptions>;
}

function buildDynamicModule(
  moduleClass: Type<unknown> | (abstract new () => unknown),
  options: TransactionalRootOptionsBase,
  registration: AdapterRegistration,
  extraImports: DynamicModule['imports'] = [],
): DynamicModule {
  // Give every adapter built through core commit/rollback/complete hooks by
  // wrapping its transaction boundary before the plugin consumes it.
  applyTransactionHooks(registration.adapter, options.connectionName);
  const plugin = new ClsPluginTransactional({
    connectionName: options.connectionName,
    enableTransactionProxy: options.enableTransactionProxy,
    imports: [...(registration.imports ?? []), ...(extraImports ?? [])] as any[],
    adapter: registration.adapter,
  });
  // Adapter-contributed providers must live inside the plugin's (global) module
  // so the adapter's `extraProviderTokens` can be resolved there.
  plugin.providers.push(...(registration.providers ?? []));
  plugin.exports.push(...(registration.exports ?? []));
  return {
    module: moduleClass as Type<unknown>,
    imports: [ClsModule.registerPlugins([plugin])],
  };
}
