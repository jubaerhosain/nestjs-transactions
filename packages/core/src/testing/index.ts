import { DynamicModule } from '@nestjs/common';
import { ClsPluginTransactional, NoOpTransactionalAdapter } from '@nestjs-cls/transactional';
import { ClsModule } from 'nestjs-cls';
import { applyTransactionHooks } from '../transaction-hooks';

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
  // Match production wiring: give the no-op adapter the same hook support so
  // commit/rollback/complete hooks fire in unit tests using this module.
  const adapter = new NoOpTransactionalAdapter({ tx: options.tx ?? {}, disableWarning: true });
  applyTransactionHooks(adapter, options.connectionName);
  return ClsModule.registerPlugins([
    new ClsPluginTransactional({
      connectionName: options.connectionName,
      // Default to an empty object: upstream throws when tx is missing, and a
      // test that only needs @Transactional() to no-op has no tx to provide.
      adapter,
    }),
  ]);
}
