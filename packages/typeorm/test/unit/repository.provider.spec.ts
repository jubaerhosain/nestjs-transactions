import { FactoryProvider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getTransactionHostToken, TransactionHost } from '@nestjs-transactional/core';
import { Repository } from 'typeorm';
import { provideTransactionAwareRepository } from '../../src/repository.provider';

class Member {}

function fakeTxHost(manager: any): TransactionHost<any> {
  return { tx: manager } as TransactionHost<any>;
}

describe('provideTransactionAwareRepository', () => {
  it('claims the exact token @InjectRepository resolves for the default data source', () => {
    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member));
    expect(provider.inject).toEqual([getTransactionHostToken(undefined)]);
  });

  it('claims the named tokens when a connection name is given', () => {
    const provider = provideTransactionAwareRepository(Member, 'stats') as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
    expect(provider.inject).toEqual([getTransactionHostToken('stats')]);
  });

  it('lets connectionName and dataSource differ via the object form', () => {
    const provider = provideTransactionAwareRepository(Member, {
      connectionName: 'stats',
      dataSource: 'statsDb',
    }) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member, 'statsDb'));
    expect(provider.inject).toEqual([getTransactionHostToken('stats')]);
  });

  it('delegates every call to the repository of the current EntityManager', () => {
    const plainRepo = { save: jest.fn().mockReturnValue('plain') };
    const txRepo = { save: jest.fn().mockReturnValue('tx') };
    let currentRepo = plainRepo;
    const manager = { getRepository: jest.fn(() => currentRepo) };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(proxy.save({})).toBe('plain');
    currentRepo = txRepo;
    expect(proxy.save({})).toBe('tx');
    expect(plainRepo.save).toHaveBeenCalledTimes(1);
    expect(txRepo.save).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(Member);
  });

  it('produces a value that passes instanceof Repository for real repositories', () => {
    const realRepo = new Repository<Member>(Member, {} as any);
    const manager = { getRepository: () => realRepo };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(proxy instanceof Repository).toBe(true);
  });

  it('uses getTreeRepository for tree entities', () => {
    const treeRepo = { kind: 'tree' };
    const manager = {
      getRepository: jest.fn(),
      getTreeRepository: jest.fn(() => treeRepo),
      connection: {
        hasMetadata: () => true,
        getMetadata: () => ({ treeType: 'closure-table' }),
      },
    };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(proxy.kind).toBe('tree');
    expect(manager.getTreeRepository).toHaveBeenCalledWith(Member);
    expect(manager.getRepository).not.toHaveBeenCalled();
  });
});
