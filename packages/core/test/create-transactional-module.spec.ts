import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InjectTransaction,
  InjectTransactionHost,
  Transactional,
  TransactionalAdapter,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { Propagation } from '../src';
import { createTransactionalModule } from '../src/create-transactional-module';
import { TransactionalAsyncOptionsBase, TransactionalRootOptionsBase } from '../src/interfaces';

interface FakeTx {
  id: number;
}

class FakeAdapter implements TransactionalAdapter<unknown, FakeTx, { label?: string }> {
  connection = {};
  private seq = 0;
  readonly fallback: FakeTx = { id: 0 };

  optionsFactory = () => ({
    wrapWithTransaction: async (
      _options: { label?: string },
      fn: (...args: any[]) => Promise<any>,
      setTx: (tx?: FakeTx) => void,
    ) => {
      setTx({ id: ++this.seq });
      return fn();
    },
    getFallbackInstance: () => this.fallback,
  });
}

const TransactionalModule = createTransactionalModule<TransactionalRootOptionsBase>({
  adapterFactory: () => ({ adapter: new FakeAdapter() }),
});

@Injectable()
class DefaultService {
  constructor(readonly txHost: TransactionHost<FakeAdapter>) {}

  @Transactional()
  async inTx(): Promise<FakeTx> {
    return this.txHost.tx;
  }

  @Transactional()
  async nested(): Promise<[FakeTx, FakeTx]> {
    return [this.txHost.tx, await this.inTx()];
  }

  @Transactional(Propagation.REQUIRES_NEW)
  async requiresNew(): Promise<FakeTx> {
    return this.txHost.tx;
  }
}

@Injectable()
class NamedService {
  constructor(@InjectTransactionHost('other') readonly txHost: TransactionHost<FakeAdapter>) {}

  @Transactional('other')
  async inTx(): Promise<FakeTx> {
    return this.txHost.tx;
  }
}

describe('createTransactionalModule', () => {
  it('wires @Transactional and TransactionHost for the default connection', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TransactionalModule.forRoot()],
      providers: [DefaultService],
    }).compile();
    const service = moduleRef.get(DefaultService);

    expect(service.txHost.tx.id).toBe(0); // fallback outside a transaction
    expect((await service.inTx()).id).toBeGreaterThan(0);
    expect(service.txHost.tx.id).toBe(0); // fallback again after the transaction

    await moduleRef.close();
  });

  it('propagates the same transaction into nested calls (Required)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TransactionalModule.forRoot()],
      providers: [DefaultService],
    }).compile();
    const service = moduleRef.get(DefaultService);

    const [outer, inner] = await service.nested();
    expect(inner.id).toBe(outer.id);

    await moduleRef.close();
  });

  it('starts an independent transaction for RequiresNew', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TransactionalModule.forRoot()],
      providers: [DefaultService],
    }).compile();
    const service = moduleRef.get(DefaultService);

    const outer = await service.txHost.withTransaction(async () => {
      const outerTx = service.txHost.tx;
      const innerTx = await service.requiresNew();
      return { outerTx, innerTx };
    });
    expect(outer.innerTx.id).not.toBe(outer.outerTx.id);

    await moduleRef.close();
  });

  it('supports named connections independently of the default one', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot(),
        TransactionalModule.forRoot({ connectionName: 'other' }),
      ],
      providers: [DefaultService, NamedService],
    }).compile();
    const named = moduleRef.get(NamedService);

    expect((await named.inTx()).id).toBeGreaterThan(0);
    expect(named.txHost.tx.id).toBe(0);

    await moduleRef.close();
  });

  it('throws from forRootAsync when the adapter does not define an async factory', () => {
    expect(() => TransactionalModule.forRootAsync({ useFactory: () => ({}) })).toThrow(
      /forRootAsync\(\) is not supported/,
    );
  });
});

describe('createTransactionalModule — adapter-contributed providers/exports', () => {
  const WIRED = 'WIRED_TOKEN';

  const ModuleWithProviders = createTransactionalModule<TransactionalRootOptionsBase>({
    adapterFactory: () => ({
      adapter: new FakeAdapter(),
      providers: [{ provide: WIRED, useValue: 'wired-value' }],
      exports: [WIRED],
    }),
  });

  @Injectable()
  class Consumer {
    constructor(@Inject(WIRED) readonly wired: string) {}
  }

  it('exposes providers the adapter registration contributes (and exports them)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ModuleWithProviders.forRoot()],
      providers: [Consumer],
    }).compile();

    // This is exactly how adapters expose their injected client/repository token.
    expect(moduleRef.get(Consumer).wired).toBe('wired-value');
    await moduleRef.close();
  });
});

describe('createTransactionalModule — enableTransactionProxy', () => {
  const ProxyModule = createTransactionalModule<TransactionalRootOptionsBase>({
    adapterFactory: () => ({ adapter: new FakeAdapter() }),
  });

  @Injectable()
  class ProxyService {
    constructor(@InjectTransaction() readonly tx: FakeTx) {}

    // Read the proxied transaction INSIDE the method — outside it the proxy
    // resolves to the adapter's fallback instance.
    @Transactional()
    async idInTx(): Promise<number> {
      return this.tx.id;
    }

    idOutsideTx(): number {
      return this.tx.id;
    }
  }

  it('wires @InjectTransaction() so the injected transaction resolves inside a tx', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProxyModule.forRoot({ enableTransactionProxy: true })],
      providers: [ProxyService],
    }).compile();
    const service = moduleRef.get(ProxyService);

    expect(await service.idInTx()).toBeGreaterThan(0); // an active transaction
    expect(service.idOutsideTx()).toBe(0); // falls back outside one
    await moduleRef.close();
  });

  it('does not register @InjectTransaction() when enableTransactionProxy is off', async () => {
    // Without the flag the transaction proxy provider is absent, so a service
    // that depends on @InjectTransaction() cannot be constructed.
    await expect(
      Test.createTestingModule({
        imports: [ProxyModule.forRoot()],
        providers: [ProxyService],
      }).compile(),
    ).rejects.toThrow();
  });
});

describe('createTransactionalModule — forRootAsync happy path', () => {
  const ASYNC_RESULT = 'ASYNC_RESULT';
  const CONFIG = 'CONFIG';

  @Module({ providers: [{ provide: CONFIG, useValue: 99 }], exports: [CONFIG] })
  class ConfigModule {}

  const AsyncModule = createTransactionalModule<
    TransactionalRootOptionsBase,
    TransactionalAsyncOptionsBase<{ value: number }>
  >({
    adapterFactory: () => ({ adapter: new FakeAdapter() }),
    asyncAdapterFactory: (options) => ({
      adapter: new FakeAdapter(),
      providers: [
        { provide: ASYNC_RESULT, useFactory: options.useFactory, inject: options.inject },
      ],
      exports: [ASYNC_RESULT],
    }),
  });

  @Injectable()
  class AsyncConsumer {
    constructor(@Inject(ASYNC_RESULT) readonly result: { value: number }) {}
  }

  it('runs the async factory and threads options.imports so injected deps resolve', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AsyncModule.forRootAsync({
          imports: [ConfigModule], // must be threaded into the plugin module…
          inject: [CONFIG], // …for this injection to resolve
          useFactory: (value: number) => ({ value: value * 2 }),
        }),
      ],
      providers: [AsyncConsumer],
    }).compile();

    expect(moduleRef.get(AsyncConsumer).result).toEqual({ value: 198 });
    await moduleRef.close();
  });

  it('works without options.imports (self-sufficient factory)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AsyncModule.forRootAsync({ useFactory: () => ({ value: 5 }) })],
      providers: [AsyncConsumer],
    }).compile();

    expect(moduleRef.get(AsyncConsumer).result).toEqual({ value: 5 });
    await moduleRef.close();
  });
});

describe('createTransactionalModule — adapter-registration imports', () => {
  const CONFIG = 'REGISTRATION_CONFIG';
  const FROM_IMPORT = 'FROM_IMPORT';

  @Module({ providers: [{ provide: CONFIG, useValue: 7 }], exports: [CONFIG] })
  class ConfigModule {}

  // An adapter registration can carry its own imports (e.g. the typeorm adapter
  // imports @nestjs/typeorm's module) — they must reach the plugin module so
  // the registration's providers can inject from them.
  const WithImports = createTransactionalModule<TransactionalRootOptionsBase>({
    adapterFactory: () => ({
      adapter: new FakeAdapter(),
      imports: [ConfigModule],
      providers: [
        { provide: FROM_IMPORT, useFactory: (value: number) => value * 3, inject: [CONFIG] },
      ],
      exports: [FROM_IMPORT],
    }),
  });

  @Injectable()
  class ImportsConsumer {
    constructor(@Inject(FROM_IMPORT) readonly value: number) {}
  }

  it('threads registration.imports into the plugin module (forRoot)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WithImports.forRoot()],
      providers: [ImportsConsumer],
    }).compile();

    expect(moduleRef.get(ImportsConsumer).value).toBe(21);
    await moduleRef.close();
  });
});
