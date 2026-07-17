import { FactoryProvider, Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import {
  createTransactionAwareProxy,
  getTransactionHostToken,
  TransactionHost,
} from '@nestjs-transactions/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { ForFeatureConnection, resolveConnection } from './interfaces';

/**
 * A provider registered under TypeORM's standard repository token — the exact
 * token `@InjectRepository(entity)` resolves — whose value delegates every
 * call to the repository of the *current* `EntityManager`: the transactional
 * one inside `@Transactional()`, the plain one outside.
 */
export function provideTransactionAwareRepository(
  entity: EntityClassOrSchema,
  connection?: ForFeatureConnection,
): Provider {
  const { connectionName, dataSource } = resolveConnection(connection);
  return {
    provide: getRepositoryToken(entity, dataSource),
    // Optional so a missing transactional connection reaches OUR error below
    // (a guided message) instead of Nest's generic can't-resolve-dependencies.
    inject: [{ token: getTransactionHostToken(connectionName), optional: true }],
    useFactory: (txHost: TransactionHost<TransactionalAdapterTypeOrm> | undefined) => {
      if (!txHost) {
        const name = connectionName ?? 'default';
        throw new Error(
          `No transactional connection '${name}' is registered, but TypeOrmModule.forFeature ` +
            `from '@nestjs-transactions/typeorm' wired a repository for entity ${entityName(entity)} to it. ` +
            `Most likely TypeOrmModule.forRoot() was imported from '@nestjs/typeorm' instead of ` +
            `'@nestjs-transactions/typeorm' — always import TypeOrmModule from '@nestjs-transactions/typeorm'. ` +
            `(For a named connection, also check that forRoot({ name: '${name}' }) is registered.)`,
        );
      }
      // Tree-vs-plain is static after DataSource init — decide once, not per access.
      let isTree: boolean | undefined;
      return createTransactionAwareProxy(() => {
        const manager = txHost.tx;
        if (isTree === undefined) {
          const connection = manager.connection;
          if (typeof connection?.hasMetadata !== 'function') {
            // Mocked manager (testing module): plain getRepository lookup, decided once.
            isTree = false;
          } else if (connection.hasMetadata(entity)) {
            isTree = !!connection.getMetadata(entity).treeType;
          }
          // Metadata not built yet (DataSource not initialized): leave undefined
          // so the decision is retried on the next access instead of frozen wrong.
        }
        const repository = isTree
          ? manager.getTreeRepository(entity)
          : manager.getRepository(entity);
        if (!repository) {
          throw new Error(
            `manager.getRepository() returned ${repository} for entity ${entityName(entity)} — ` +
              'if you are using a mocked manager, add a mock repository for this entity.',
          );
        }
        return repository;
      });
    },
  };
}

/**
 * Build the providers + export tokens for a set of entities. Shared by
 * `TypeOrmModule.forFeature` and the testing module so both always wire
 * repositories identically.
 */
export function buildFeatureProviders(
  entities: EntityClassOrSchema[],
  connection?: ForFeatureConnection,
): { providers: Provider[]; exports: FactoryProvider['provide'][] } {
  const providers = entities.map((entity) => provideTransactionAwareRepository(entity, connection));
  return {
    providers,
    exports: providers.map((provider) => (provider as FactoryProvider).provide),
  };
}

function entityName(entity: EntityClassOrSchema): string {
  if (typeof entity === 'function') {
    return entity.name;
  }
  const options = entity.options as { name?: string } | undefined;
  return options?.name ?? String(entity);
}
