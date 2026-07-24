import { getDataSourceToken } from '@nestjs/typeorm';
import { AsyncOptionsTypeOrmAdapter, TransactionalModule } from '../../src/transactional.module';

describe('TransactionalModule (internal)', () => {
  describe('forRoot', () => {
    it('produces a dynamic module wired through ClsModule.registerPlugins', () => {
      const dynamicModule = TransactionalModule.forRoot();
      expect(dynamicModule.module).toBe(TransactionalModule);
      expect(dynamicModule.imports).toHaveLength(1);
    });
  });

  describe('forRootAsync', () => {
    it('produces a dynamic module wired through ClsModule.registerPlugins', () => {
      const dynamicModule = TransactionalModule.forRootAsync({ useFactory: () => ({}) });
      expect(dynamicModule.module).toBe(TransactionalModule);
      expect(dynamicModule.imports).toHaveLength(1);
    });
  });
});

describe('AsyncOptionsTypeOrmAdapter (internal)', () => {
  // The plugin calls optionsFactory at DI time with the resolved DataSource and
  // the providers listed in `extraProviderTokens` (the async factory result),
  // then reads `defaultTxOptions` synchronously right after.
  const fakeDataSource = { manager: { id: 'base-manager' } } as any;

  // The upstream adapter declares optionsFactory with the DataSource only; the
  // extra-providers second argument is a plugin-level convention, so view the
  // runtime signature explicitly for the calls below.
  const factoryOf = (adapter: AsyncOptionsTypeOrmAdapter) =>
    adapter.optionsFactory as (
      dataSource: any,
      extraProviders?: any[],
    ) => ReturnType<AsyncOptionsTypeOrmAdapter['optionsFactory']>;

  it('adopts defaultTxOptions from the DI-resolved async factory result', () => {
    const adapter = new AsyncOptionsTypeOrmAdapter(getDataSourceToken());

    const options = factoryOf(adapter)(fakeDataSource, [
      { defaultTxOptions: { isolationLevel: 'SERIALIZABLE' } },
    ]);

    expect(adapter.defaultTxOptions).toEqual({ isolationLevel: 'SERIALIZABLE' });
    // …and still returns the underlying adapter's wrappers over the DataSource.
    expect(typeof options.wrapWithTransaction).toBe('function');
    expect(typeof options.wrapWithNestedTransaction).toBe('function');
    expect(options.getFallbackInstance()).toBe(fakeDataSource.manager);
  });

  it('clears stale defaultTxOptions when the next factory result provides none', () => {
    // The adapter instance is shared across app compiles of the same module —
    // one app's options must not leak into the next (unconditional assignment).
    const adapter = new AsyncOptionsTypeOrmAdapter(getDataSourceToken());
    factoryOf(adapter)(fakeDataSource, [{ defaultTxOptions: { isolationLevel: 'SERIALIZABLE' } }]);
    expect(adapter.defaultTxOptions).toEqual({ isolationLevel: 'SERIALIZABLE' });

    factoryOf(adapter)(fakeDataSource, [{}]);

    expect(adapter.defaultTxOptions).toBeUndefined();
  });

  it('tolerates a missing extra-providers array', () => {
    const adapter = new AsyncOptionsTypeOrmAdapter(getDataSourceToken());

    const options = adapter.optionsFactory(fakeDataSource);

    expect(adapter.defaultTxOptions).toBeUndefined();
    expect(options.getFallbackInstance()).toBe(fakeDataSource.manager);
  });

  it('lists the async options token so the plugin resolves it through DI', () => {
    const adapter = new AsyncOptionsTypeOrmAdapter(getDataSourceToken());
    expect(adapter.extraProviderTokens).toHaveLength(1);
    expect(typeof adapter.extraProviderTokens[0]).toBe('symbol');
  });
});
