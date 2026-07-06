import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { createNoOpTransactionalModule } from '@nestjs-transactional/core/testing';
import { EntityManager } from 'typeorm';
import { ForFeatureConnection } from '../interfaces';
import { provideTransactionAwareRepository } from '../repository.provider';

export { createNoOpTransactionalModule, NoOpTransactionalAdapter } from '@nestjs-transactional/core/testing';

export interface NoOpTypeOrmTransactionalOptions {
  /**
   * Stands in for the EntityManager: `TransactionHost#tx` resolves to it and
   * repositories for `entities` call `manager.getRepository(entity)` on it —
   * so a mock only needs `getRepository` returning your repository mocks.
   */
  manager: { getRepository(entity: any): any } | EntityManager;
  /** Entities to register mocked `@InjectRepository` tokens for. */
  entities?: EntityClassOrSchema[];
  /** Wire the no-op plugin and repositories for a named connection. */
  connection?: ForFeatureConnection;
}

/**
 * Unit-test replacement for `TransactionalModule.forRoot()` +
 * `TransactionalModule.forFeature()`: `@Transactional()` methods run without
 * real transactions and `@InjectRepository` resolves proxies over
 * `manager.getRepository(entity)`.
 */
export function createNoOpTypeOrmTransactionalModule(
  options: NoOpTypeOrmTransactionalOptions,
): DynamicModule {
  const connectionName =
    typeof options.connection === 'string' ? options.connection : options.connection?.connectionName;
  const providers = (options.entities ?? []).map((entity) =>
    provideTransactionAwareRepository(entity, options.connection),
  );
  return {
    module: NoOpTypeOrmTransactionalModule,
    imports: [createNoOpTransactionalModule({ tx: options.manager, connectionName })],
    providers,
    exports: providers.map((provider) => (provider as FactoryProvider).provide),
  };
}

class NoOpTypeOrmTransactionalModule {}
