import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InjectTransactionHost,
  Transactional,
  TransactionalAdapter,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { Propagation } from '../src';
import { createTransactionalModule } from '../src/create-transactional-module';
import { TransactionalRootOptionsBase } from '../src/interfaces';

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
