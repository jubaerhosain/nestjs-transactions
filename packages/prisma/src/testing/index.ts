import { DynamicModule } from '@nestjs/common';
import { createNoOpTransactionalModule } from '@nestjs-transactions/core/testing';
import { normalizeName } from '../interfaces';
import {
  getPrismaClientToken,
  provideTransactionAwarePrismaClient,
} from '../prisma-client.provider';

export {
  createNoOpTransactionalModule,
  NoOpTransactionalAdapter,
} from '@nestjs-transactions/core/testing';

export interface NoOpPrismaTransactionalOptions {
  /**
   * Stands in for the Prisma client: `TransactionHost#tx` and the injected
   * transaction-aware client both resolve to it — so a mock only needs the
   * model delegates your code touches (e.g. `{ author: { create: jest.fn() } }`).
   */
  client?: object;
  /** Wire the no-op plugin and client for a named connection. */
  connectionName?: string;
}

/**
 * Unit-test replacement for `TransactionalModule.forRoot()`:
 * `@Transactional()` methods run without real transactions and
 * `@InjectPrismaClient()` resolves a proxy over the given mock client.
 */
export function createNoOpPrismaTransactionalModule(
  options: NoOpPrismaTransactionalOptions = {},
): DynamicModule {
  const connectionName = normalizeName(options.connectionName);
  return {
    module: NoOpPrismaTransactionalModule,
    imports: [createNoOpTransactionalModule({ tx: options.client ?? {}, connectionName })],
    providers: [provideTransactionAwarePrismaClient(connectionName)],
    exports: [getPrismaClientToken(connectionName)],
  };
}

class NoOpPrismaTransactionalModule {}
