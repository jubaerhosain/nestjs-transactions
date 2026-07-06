import { DynamicModule } from '@nestjs/common';
import { ClsPluginTransactional, NoOpTransactionalAdapter } from '@nestjs-cls/transactional';
import { ClsModule } from 'nestjs-cls';

export { NoOpTransactionalAdapter } from '@nestjs-cls/transactional';

export interface NoOpTransactionalModuleOptions {
  /**
   * The value `TransactionHost#tx` resolves to. Pass your mocked
   * client/EntityManager so code under test keeps working.
   */
  tx?: any;
  /** Wire the no-op plugin for a named connection. */
  connectionName?: string;
}

/**
 * A drop-in replacement for `TransactionalModule.forRoot()` in unit tests:
 * satisfies `@Transactional()` and `TransactionHost` injection without opening
 * real transactions.
 */
export function createNoOpTransactionalModule(
  options: NoOpTransactionalModuleOptions = {},
): DynamicModule {
  return ClsModule.registerPlugins([
    new ClsPluginTransactional({
      connectionName: options.connectionName,
      adapter: new NoOpTransactionalAdapter({ tx: options.tx, disableWarning: true }),
    }),
  ]);
}
