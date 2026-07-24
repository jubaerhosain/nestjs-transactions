import { DynamicModule, FactoryProvider } from '@nestjs/common';
import { TypeOrmModule as NestTypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';

import { NestjsTypeormRootOptions } from '../../src/interfaces';
import { NestjsTypeormModule } from '../../src/nestjs-typeorm.module';
import { TransactionalModule } from '../../src/transactional.module';

class Member {}
class Order {}

describe('NestjsTypeormModule (unified)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('forRoot', () => {
    it('composes @nestjs/typeorm forRoot and the internal transactional module', () => {
      const dynamicModule = NestjsTypeormModule.forRoot();
      expect(dynamicModule.module).toBe(NestjsTypeormModule);
      expect(dynamicModule.imports).toHaveLength(2);
    });

    it('strips the transactional keys before delegating to @nestjs/typeorm', () => {
      const nestForRoot = jest.spyOn(NestTypeOrmModule, 'forRoot');
      const txForRoot = jest.spyOn(TransactionalModule, 'forRoot');

      NestjsTypeormModule.forRoot({
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

      NestjsTypeormModule.forRoot({ type: 'postgres', name: 'stats' });

      expect(nestForRoot).toHaveBeenCalledWith({ type: 'postgres', name: 'stats' });
      expect(txForRoot).toHaveBeenCalledWith(
        expect.objectContaining({ connectionName: 'stats', dataSource: 'stats' }),
      );
    });
  });

  describe('forRootAsync', () => {
    it('runs the user factory through ONE shared options module imported by both halves', () => {
      const nestForRootAsync = jest.spyOn(NestTypeOrmModule, 'forRootAsync');
      const txForRootAsync = jest.spyOn(TransactionalModule, 'forRootAsync');
      const useFactory = jest.fn();

      NestjsTypeormModule.forRootAsync({ useFactory });

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

      NestjsTypeormModule.forRootAsync({ useFactory: () => ({ type: 'postgres' }) });

      const nestArgs = nestForRootAsync.mock.calls[0][0];
      const combined: NestjsTypeormRootOptions = {
        type: 'postgres',
        name: 'sneaky', // must not override the static (absent) outer name
        defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        enableTransactionProxy: true,
      };
      expect(nestArgs.useFactory!(combined)).toEqual({ type: 'postgres' });
    });

    it('feeds only defaultTxOptions to the transactional half', () => {
      const txForRootAsync = jest.spyOn(TransactionalModule, 'forRootAsync');

      NestjsTypeormModule.forRootAsync({ useFactory: () => ({ type: 'postgres' }) });

      const txArgs = txForRootAsync.mock.calls[0][0];
      expect(
        txArgs.useFactory({
          type: 'postgres',
          defaultTxOptions: { isolationLevel: 'SERIALIZABLE' },
        }),
      ).toEqual({ defaultTxOptions: { isolationLevel: 'SERIALIZABLE' } });
    });

    it('uses a unique options token per registration (never collides)', () => {
      const nestForRootAsync = jest.spyOn(NestTypeOrmModule, 'forRootAsync');

      // Two registrations for the SAME name still get distinct symbols.
      NestjsTypeormModule.forRootAsync({ useFactory: () => ({}) });
      NestjsTypeormModule.forRootAsync({ useFactory: () => ({}) });
      NestjsTypeormModule.forRootAsync({ name: 'stats', useFactory: () => ({}) });

      const [t0, t1, t2] = nestForRootAsync.mock.calls.map((c) => c[0].inject?.[0]);
      expect(typeof t0).toBe('symbol');
      expect(t0).not.toBe(t1);
      expect(t0).not.toBe(t2);
      expect(nestForRootAsync.mock.calls[2][0].name).toBe('stats');
    });
  });

  describe('forFeature', () => {
    it('registers and exports one transaction-aware provider per entity', () => {
      const dynamicModule = NestjsTypeormModule.forFeature([Member, Order]);

      const tokens = (dynamicModule.providers as FactoryProvider[]).map((p) => p.provide);
      expect(tokens).toEqual([getRepositoryToken(Member), getRepositoryToken(Order)]);
      expect(dynamicModule.exports).toEqual(tokens);
      expect(dynamicModule.module).toBe(NestjsTypeormModule);
    });

    it('imports @nestjs/typeorm forFeature so autoLoadEntities keeps working', () => {
      const nestForFeature = jest.spyOn(NestTypeOrmModule, 'forFeature');

      const dynamicModule = NestjsTypeormModule.forFeature([Member]);

      expect(nestForFeature).toHaveBeenCalledWith([Member], 'default');
      expect(dynamicModule.imports).toEqual([nestForFeature.mock.results[0].value]);
    });

    it('uses named tokens and the named DataSource for a named connection', () => {
      const nestForFeature = jest.spyOn(NestTypeOrmModule, 'forFeature');

      const dynamicModule = NestjsTypeormModule.forFeature([Member], 'stats');

      const provider = (dynamicModule.providers as FactoryProvider[])[0];
      expect(provider.provide).toBe(getRepositoryToken(Member, 'stats'));
      expect(nestForFeature).toHaveBeenCalledWith([Member], 'stats');
    });

    it('rejects a split { connectionName, dataSource } the unified module cannot satisfy', () => {
      // forRoot({ name }) keys the TransactionHost to the DataSource name, so a
      // differing connectionName would inject a token that is never registered.
      expect(() =>
        NestjsTypeormModule.forFeature([Member], {
          connectionName: 'reporting',
          dataSource: 'stats',
        }),
      ).toThrow(/split connection is not supported|connectionName 'reporting'/);
    });

    it('allows the single-key object form (connectionName defaults to dataSource)', () => {
      expect(() => NestjsTypeormModule.forFeature([Member], { dataSource: 'stats' })).not.toThrow();
      expect(() =>
        NestjsTypeormModule.forFeature([Member], { connectionName: 'stats' }),
      ).not.toThrow();
    });
  });
});
