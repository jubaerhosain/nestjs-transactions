import { FactoryProvider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getTransactionHostToken, TransactionHost } from '@nestjs-transactions/core';
import { EntitySchema, Repository } from 'typeorm';
import { provideTransactionAwareRepository } from '../../src/repository.provider';

class Member {}

function fakeTxHost(manager: any): TransactionHost<any> {
  return { tx: manager } as TransactionHost<any>;
}

describe('provideTransactionAwareRepository', () => {
  it('claims the exact token @InjectRepository resolves for the default data source', () => {
    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member));
    expect(provider.inject).toEqual([
      { token: getTransactionHostToken(undefined), optional: true },
    ]);
  });

  it('claims the named tokens when a connection name is given', () => {
    const provider = provideTransactionAwareRepository(Member, 'stats') as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
    expect(provider.inject).toEqual([{ token: getTransactionHostToken('stats'), optional: true }]);
  });

  it('derives the connection name from a dataSource-only object form', () => {
    const provider = provideTransactionAwareRepository(Member, {
      dataSource: 'stats',
    }) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
    expect(provider.inject).toEqual([{ token: getTransactionHostToken('stats'), optional: true }]);
  });

  it('lets connectionName and dataSource differ via the object form', () => {
    const provider = provideTransactionAwareRepository(Member, {
      connectionName: 'stats',
      dataSource: 'statsDb',
    }) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(Member, 'statsDb'));
    expect(provider.inject).toEqual([{ token: getTransactionHostToken('stats'), optional: true }]);
  });

  it('throws a guided bootstrap error when the transactional connection is missing', () => {
    // The classic mix-up: TypeOrmModule.forRoot() imported from '@nestjs/typeorm'
    // (which registers no TransactionHost) alongside OUR forFeature.
    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    expect(() => provider.useFactory(undefined)).toThrow(
      /No transactional connection 'default'.*imported from '@nestjs\/typeorm' instead of.*'@nestjs-transactions\/typeorm'/s,
    );

    const named = provideTransactionAwareRepository(Member, 'stats') as FactoryProvider;
    expect(() => named.useFactory(undefined)).toThrow(/No transactional connection 'stats'/);
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

  it('throws a descriptive error naming the entity when getRepository returns undefined', () => {
    const manager = { getRepository: jest.fn(() => undefined) };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(() => proxy.save({})).toThrow(/getRepository\(\) returned undefined for entity Member/);
  });

  it('resolves the token and error name from an EntitySchema entity', () => {
    const schema = new EntitySchema<{ id: number }>({
      name: 'MemberSchema',
      columns: { id: { type: Number, primary: true } },
    });

    const provider = provideTransactionAwareRepository(schema) as FactoryProvider;
    expect(provider.provide).toBe(getRepositoryToken(schema));

    const manager = { getRepository: jest.fn(() => undefined) };
    const proxy = provider.useFactory(fakeTxHost(manager));
    expect(() => proxy.save({})).toThrow(/for entity MemberSchema/);
  });

  it('uses getRepository when the entity has metadata but is not a tree', () => {
    const plainRepo = { kind: 'plain' };
    const manager = {
      getRepository: jest.fn(() => plainRepo),
      getTreeRepository: jest.fn(),
      connection: {
        hasMetadata: () => true,
        getMetadata: () => ({ treeType: undefined }),
      },
    };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(proxy.kind).toBe('plain');
    expect(manager.getRepository).toHaveBeenCalledWith(Member);
    expect(manager.getTreeRepository).not.toHaveBeenCalled();
  });

  it('re-checks the tree decision when entity metadata was not yet available', () => {
    // First access happens before the DataSource has built its metadata: the
    // decision must NOT be frozen as "plain" — once metadata exists, a tree
    // entity has to resolve through getTreeRepository.
    const plainRepo = { kind: 'plain' };
    const treeRepo = { kind: 'tree' };
    let metadataReady = false;
    const manager = {
      getRepository: jest.fn(() => plainRepo),
      getTreeRepository: jest.fn(() => treeRepo),
      connection: {
        hasMetadata: jest.fn(() => metadataReady),
        getMetadata: () => ({ treeType: 'closure-table' }),
      },
    };

    const provider = provideTransactionAwareRepository(Member) as FactoryProvider;
    const proxy = provider.useFactory(fakeTxHost(manager));

    expect(proxy.kind).toBe('plain'); // metadata missing → plain lookup for now
    metadataReady = true;
    expect(proxy.kind).toBe('tree'); // retried, not frozen as plain
    expect(proxy.kind).toBe('tree'); // and cached from here on
    expect(manager.connection.hasMetadata).toHaveBeenCalledTimes(2);
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
