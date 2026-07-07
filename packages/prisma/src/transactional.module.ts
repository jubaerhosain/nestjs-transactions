import { DynamicModule } from '@nestjs/common';
import { createTransactionalModule } from '@nestjs-transactions/core';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import {
  normalizeName,
  PrismaTransactionalAsyncFactoryResult,
  PrismaTransactionalAsyncOptions,
  PrismaTransactionalOptions,
  PrismaTxOptions,
  SqlFlavor,
} from './interfaces';
import {
  getPrismaClientToken,
  provideTransactionAwarePrismaClient,
} from './prisma-client.provider';

const ASYNC_OPTIONS_TOKEN = Symbol('PRISMA_TRANSACTIONAL_ASYNC_OPTIONS');

/**
 * TransactionalAdapterPrisma whose `defaultTxOptions` are resolved through DI
 * (the plugin passes providers listed in `extraProviderTokens` to
 * `optionsFactory`, and reads `defaultTxOptions` right after calling it).
 */
class AsyncOptionsPrismaAdapter extends TransactionalAdapterPrisma {
  extraProviderTokens = [ASYNC_OPTIONS_TOKEN];

  constructor(options: { prismaInjectionToken: any; sqlFlavor?: SqlFlavor }) {
    super(options);
    const original = this.optionsFactory;
    this.optionsFactory = ((prisma: any, extraProviders?: any[]) => {
      const resolved = extraProviders?.[0] as PrismaTransactionalAsyncFactoryResult | undefined;
      // Assign unconditionally: the plugin reads defaultTxOptions synchronously
      // right after this call, and the adapter instance is shared across app
      // compiles of the same module — a conditional assignment would leak one
      // app's options into the next.
      this.defaultTxOptions = resolved?.defaultTxOptions as PrismaTxOptions | undefined;
      return original(prisma);
    }) as typeof this.optionsFactory;
  }
}

const TransactionalModuleBase = createTransactionalModule<
  PrismaTransactionalOptions,
  PrismaTransactionalAsyncOptions
>({
  adapterFactory: (options) => ({
    adapter: new TransactionalAdapterPrisma({
      prismaInjectionToken: options.prismaToken,
      sqlFlavor: options.sqlFlavor,
      defaultTxOptions: options.defaultTxOptions,
    }),
    imports: options.imports,
    providers: [provideTransactionAwarePrismaClient(options.connectionName)],
    exports: [getPrismaClientToken(options.connectionName)],
  }),
  asyncAdapterFactory: (options) => ({
    adapter: new AsyncOptionsPrismaAdapter({
      prismaInjectionToken: options.prismaToken,
      sqlFlavor: options.sqlFlavor,
    }),
    providers: [
      {
        provide: ASYNC_OPTIONS_TOKEN,
        useFactory: options.useFactory,
        inject: options.inject,
      },
      provideTransactionAwarePrismaClient(options.connectionName),
    ],
    exports: [getPrismaClientToken(options.connectionName)],
  }),
});

export class TransactionalModule extends TransactionalModuleBase {
  static override forRoot(options: PrismaTransactionalOptions): DynamicModule {
    return super.forRoot(withNormalizedConnection(options));
  }

  static override forRootAsync(options: PrismaTransactionalAsyncOptions): DynamicModule {
    return super.forRootAsync(withNormalizedConnection(options));
  }
}

/**
 * Normalize the connection name once, before the base class registers the CLS
 * plugin, so `{ connectionName: 'default' }` targets the default connection
 * (whose TransactionHost token is `undefined`) instead of registering a
 * never-resolvable `TransactionHost_default`.
 */
function withNormalizedConnection<
  T extends PrismaTransactionalOptions | PrismaTransactionalAsyncOptions,
>(options: T): T {
  return { ...options, connectionName: normalizeName(options.connectionName) };
}
