import { DynamicModule } from '@nestjs/common';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { createNoOpTransactionalModule } from '@nestjs-transactions/core/testing';
import { EntityManager } from 'typeorm';
import { ForFeatureConnection, resolveConnection } from '../interfaces';
import { buildFeatureProviders } from '../repository.provider';

export {
  createNoOpTransactionalModule,
  NoOpTransactionalAdapter,
} from '@nestjs-transactions/core/testing';

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
 * Unit-test replacement for `TypeOrmModule.forRoot()` +
 * `TypeOrmModule.forFeature()`: `@Transactional()` methods run without
 * real transactions and `@InjectRepository` resolves proxies over
 * `manager.getRepository(entity)` — no DataSource is created.
 */
export function createNoOpTypeOrmTransactionalModule(
  options: NoOpTypeOrmTransactionalOptions,
): DynamicModule {
  const { connectionName } = resolveConnection(options.connection);
  const { providers, exports } = buildFeatureProviders(options.entities ?? [], options.connection);
  return {
    module: NoOpTypeOrmTransactionalModule,
    imports: [createNoOpTransactionalModule({ tx: options.manager, connectionName })],
    providers,
    exports,
  };
}

class NoOpTypeOrmTransactionalModule {}
