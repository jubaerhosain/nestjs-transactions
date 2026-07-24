import * as nestTypeorm from '@nestjs/typeorm';
import * as upstreamAdapter from '@nestjs-cls/transactional-adapter-typeorm';
import * as core from '@nestjs-transactions/core';
import * as api from '../../src';
import { IsolationLevel } from '../../src/isolation-level';
import { NestjsTypeormModule } from '../../src/nestjs-typeorm.module';
import { NestjsTypeormRepository } from '../../src/nestjs-typeorm.repository';
import { provideTransactionAwareRepository } from '../../src/repository.provider';
import { Transactional as FacadeTransactional } from '../../src/transactional';

/**
 * Executable form of the repo's "single symbol identity" convention: the
 * adapter re-exports core's and @nestjs/typeorm's symbols — never redefines
 * them — with ONE deliberate exception: `Transactional` is this package's
 * object-form facade wrapping core's decorator.
 *
 * (Coverage note: this spec also exercises the barrel's CJS re-export getters;
 * the remaining branch marker in nestjs-typeorm.repository.ts is TS-emitted
 * decorator-metadata scaffolding and not reachable from tests.)
 */
describe('public surface — single symbol identity', () => {
  const coreReExports = [
    'InjectTransaction',
    'InjectTransactionHost',
    'Propagation',
    'TransactionAlreadyActiveError',
    'TransactionHost',
    'TransactionNotActiveError',
    'TransactionPropagationError',
    'getTransactionHostToken',
    'getTransactionToken',
    'runOnTransactionCommit',
    'runOnTransactionComplete',
    'runOnTransactionRollback',
  ] as const;

  it.each(coreReExports)('%s is core’s own symbol', (name) => {
    expect(api[name]).toBeDefined();
    expect(api[name]).toBe(core[name]);
  });

  const nestTypeormReExports = [
    'InjectDataSource',
    'InjectEntityManager',
    'InjectRepository',
    'getDataSourceToken',
    'getEntityManagerToken',
    'getRepositoryToken',
  ] as const;

  it.each(nestTypeormReExports)('%s is @nestjs/typeorm’s own symbol', (name) => {
    expect(api[name]).toBeDefined();
    expect(api[name]).toBe(nestTypeorm[name]);
  });

  it('Transactional is the object-form facade — deliberately NOT core’s decorator', () => {
    expect(api.Transactional).toBe(FacadeTransactional);
    expect(api.Transactional).not.toBe(core.Transactional);
  });

  it('exports the upstream adapter under both names with one identity', () => {
    expect(api.TransactionalAdapterTypeOrm).toBe(upstreamAdapter.TransactionalAdapterTypeOrm);
    expect(api.TypeOrmAdapter).toBe(upstreamAdapter.TransactionalAdapterTypeOrm);
  });

  it('exports the TypeORM-specific extras', () => {
    expect(api.IsolationLevel).toBe(IsolationLevel);
    expect(api.NestjsTypeormModule).toBe(NestjsTypeormModule);
    expect(api.NestjsTypeormRepository).toBe(NestjsTypeormRepository);
    expect(api.provideTransactionAwareRepository).toBe(provideTransactionAwareRepository);
  });
});
