import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { TypeOrmModule as NestTypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';

import { TypeOrmRootOptions } from '../../src/interfaces';
import { TransactionalModule } from '../../src/transactional.module';
import { TypeOrmModule } from '../../src/typeorm.module';

class Member {}
class Order {}

describe('TypeOrmModule (unified)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('forRoot', () => {
    it('composes @nestjs/typeorm forRoot and the internal transactional module', () => {
      const dynamicModule = TypeOrmModule.forRoot();
      expect(dynamicModule.module).toBe(TypeOrmModule);
      expect(dynamicModule.imports).toHaveLength(2);
    });

    it('strips the transactional keys before delegating to @nestjs/typeorm', () => {
      const nestForRoot = jest.spyOn(NestTypeOrmModule, 'forRoot');
      const txForRoot = jest.spyOn(TransactionalModule, 'forRoot');

      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'db',
        defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        enableTransactionProxy: true,
      });

      expect(nestForRoot).toHaveBeenCalledWith({ type: 'postgres', host: 'db' });
      expect(txForRoot).toHaveBeenCalledWith({
        connectionName: undefined,
        dataSource: undefined,
        defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        enableTransactionProxy: true,
      });
    });

    it('maps `name` to both the DataSource and the transactional connection', () => {
      const nestForRoot = jest.spyOn(NestTypeOrmModule, 'forRoot');
      const txForRoot = jest.spyOn(TransactionalModule, 'forRoot');

      TypeOrmModule.forRoot({ type: 'postgres', name: 'stats' });

      expect(nestForRoot).toHaveBeenCalledWith({ type: 'postgres', name: 'stats' });
      expect(txForRoot).toHaveBeenCalledWith(
        expect.objectContaining({ connectionName: 'stats', dataSource: 'stats' }),
      );
    });

    it('registers the repository-conflict checker by default, none with "off"', () => {
      const nestForRoot = jest.spyOn(NestTypeOrmModule, 'forRoot');

      const withChecker = TypeOrmModule.forRoot({ type: 'postgres' });
      expect(withChecker.providers).toHaveLength(1);
      expect((withChecker.providers?.[0] as FactoryProvider).provide).toContain(
        'REPO_CONFLICT_CHECKER',
      );

      const without = TypeOrmModule.forRoot({ type: 'postgres', repositoryConflictCheck: 'off' });
      expect(without.providers).toHaveLength(0);
      // The option never reaches @nestjs/typeorm.
      expect(nestForRoot).toHaveBeenLastCalledWith({ type: 'postgres' });
    });
  });

  describe('forRootAsync', () => {
    it('runs the user factory through ONE shared options module imported by both halves', () => {
      const nestForRootAsync = jest.spyOn(NestTypeOrmModule, 'forRootAsync');
      const txForRootAsync = jest.spyOn(TransactionalModule, 'forRootAsync');
      const useFactory = jest.fn();

      TypeOrmModule.forRootAsync({ useFactory });

      const nestArgs = nestForRootAsync.mock.calls[0][0];
      const txArgs = txForRootAsync.mock.calls[0][0];
      // Identical object reference — Nest dedupes it to a single module
      // instance, so the user factory runs once.
      expect(nestArgs.imports?.[0]).toBe(txArgs.imports?.[0]);
      const optionsModule = nestArgs.imports?.[0] as DynamicModule;
      const optionsProvider = optionsModule.providers?.[0] as FactoryProvider;
      expect(optionsProvider.useFactory).toBe(useFactory);
      expect(nestArgs.inject).toEqual([optionsProvider.provide]);
      expect(txArgs.inject).toEqual([optionsProvider.provide]);
    });

    it('strips `name` and the transactional keys from the factory result for @nestjs/typeorm', () => {
      const nestForRootAsync = jest.spyOn(NestTypeOrmModule, 'forRootAsync');

      TypeOrmModule.forRootAsync({ useFactory: () => ({ type: 'postgres' }) });

      const nestArgs = nestForRootAsync.mock.calls[0][0];
      const combined: TypeOrmRootOptions = {
        type: 'postgres',
        name: 'sneaky', // must not override the static (absent) outer name
        defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        enableTransactionProxy: true,
        repositoryConflictCheck: 'off', // static-only: stripped and ignored
      };
      expect(nestArgs.useFactory!(combined)).toEqual({ type: 'postgres' });
    });

    it('registers the conflict checker from the STATIC outer options', () => {
      const withChecker = TypeOrmModule.forRootAsync({ useFactory: () => ({}) });
      expect(withChecker.providers).toHaveLength(1);

      const without = TypeOrmModule.forRootAsync({
        repositoryConflictCheck: 'off',
        useFactory: () => ({}),
      });
      expect(without.providers).toHaveLength(0);
    });

    it('feeds only defaultTxOptions to the transactional half', () => {
      const txForRootAsync = jest.spyOn(TransactionalModule, 'forRootAsync');

      TypeOrmModule.forRootAsync({ useFactory: () => ({ type: 'postgres' }) });

      const txArgs = txForRootAsync.mock.calls[0][0];
      expect(
        txArgs.useFactory({
          type: 'postgres',
          defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        }),
      ).toEqual({ defaultTxOptions: { isolationLevel: 'SERIALIZABLE' } });
    });

    it('scopes the shared options token by connection name', () => {
      const nestForRootAsync = jest.spyOn(NestTypeOrmModule, 'forRootAsync');

      TypeOrmModule.forRootAsync({ useFactory: () => ({}) });
      TypeOrmModule.forRootAsync({ name: 'stats', useFactory: () => ({}) });

      const defaultToken = nestForRootAsync.mock.calls[0][0].inject?.[0];
      const statsToken = nestForRootAsync.mock.calls[1][0].inject?.[0];
      expect(defaultToken).not.toEqual(statsToken);
      expect(nestForRootAsync.mock.calls[1][0].name).toBe('stats');
    });
  });

  describe('forFeature', () => {
    it('registers and exports one transaction-aware provider per entity', () => {
      const dynamicModule = TypeOrmModule.forFeature([Member, Order]);

      const tokens = (dynamicModule.providers as FactoryProvider[]).map((p) => p.provide);
      expect(tokens).toEqual([getRepositoryToken(Member), getRepositoryToken(Order)]);
      expect(dynamicModule.exports).toEqual(tokens);
      expect(dynamicModule.module).toBe(TypeOrmModule);
    });

    it('imports @nestjs/typeorm forFeature so autoLoadEntities keeps working', () => {
      const nestForFeature = jest.spyOn(NestTypeOrmModule, 'forFeature');

      const dynamicModule = TypeOrmModule.forFeature([Member]);

      expect(nestForFeature).toHaveBeenCalledWith([Member], 'default');
      expect(dynamicModule.imports).toEqual([nestForFeature.mock.results[0].value]);
    });

    it('uses named tokens and the named DataSource for a named connection', () => {
      const nestForFeature = jest.spyOn(NestTypeOrmModule, 'forFeature');

      const dynamicModule = TypeOrmModule.forFeature([Member], 'stats');

      const provider = (dynamicModule.providers as FactoryProvider[])[0];
      expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
      expect(nestForFeature).toHaveBeenCalledWith([Member], 'stats');
    });
  });
});
