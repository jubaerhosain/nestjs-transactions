import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import {
  createTransactionAwareProxy,
  getTransactionHostToken,
  TransactionHost,
} from '@nestjs-transactional/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { EntityManager } from 'typeorm';
import { ForFeatureConnection, normalizeForFeatureConnection } from './interfaces';

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
  const { connectionName, dataSource } = normalizeForFeatureConnection(connection);
  return {
    provide: getRepositoryToken(entity, dataSource),
    inject: [getTransactionHostToken(connectionName)],
    useFactory: (txHost: TransactionHost<TransactionalAdapterTypeOrm>) =>
      createTransactionAwareProxy(() => resolveRepository(txHost.tx, entity)),
  };
}

function resolveRepository(manager: EntityManager, entity: EntityClassOrSchema) {
  // Mirror @nestjs/typeorm's forFeature behavior: tree entities get a TreeRepository.
  // The optional chaining keeps mocked managers (testing module) working.
  if (manager.connection?.hasMetadata?.(entity) && manager.connection.getMetadata(entity).treeType) {
    return manager.getTreeRepository(entity);
  }
  return manager.getRepository(entity);
}
