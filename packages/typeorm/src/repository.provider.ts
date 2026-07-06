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
    inject: [getTransactionHostToken(connectionName)],
    useFactory: (txHost: TransactionHost<TransactionalAdapterTypeOrm>) => {
      // Tree-vs-plain is static after DataSource init — decide once, not per access.
      let isTree: boolean | undefined;
      return createTransactionAwareProxy(() => {
        const manager = txHost.tx;
        if (isTree === undefined) {
          // Optional chaining keeps mocked managers (testing module) working:
          // no connection metadata means a plain getRepository lookup.
          isTree =
            (manager.connection?.hasMetadata?.(entity) &&
              !!manager.connection.getMetadata(entity).treeType) ||
            false;
        }
        const repository = isTree ? manager.getTreeRepository(entity) : manager.getRepository(entity);
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
 * `TransactionalModule.forFeature` and the testing module so both always wire
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
