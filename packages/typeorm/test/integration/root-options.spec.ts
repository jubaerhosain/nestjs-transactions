import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InjectTransaction,
  IsolationLevel,
  Transactional,
  TransactionalAdapterTypeOrm,
  TransactionalModule,
} from '../../src';
import type { Transaction } from '../../src';
import { Member, PG_A } from './fixtures';

@Injectable()
class IsolationProbe {
  constructor(@InjectRepository(Member) readonly repo: Repository<Member>) {}

  @Transactional()
  async currentIsolationLevel(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    return transaction_isolation;
  }

  // Per-call options must override the root defaultTxOptions for this one call.
  @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
  async serializableIsolationLevel(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    return transaction_isolation;
  }
}

async function bootWith(transactionalRoot: ReturnType<typeof TransactionalModule.forRoot>) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(PG_A),
      transactionalRoot,
      TransactionalModule.forFeature([Member]),
    ],
    providers: [IsolationProbe],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('forRoot options (real Postgres)', () => {
  let moduleRef: TestingModule;

  afterEach(() => moduleRef.close());

  it('applies defaultTxOptions from forRoot to every transaction', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({
        defaultTxOptions: { isolationLevel: IsolationLevel.SERIALIZABLE },
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('serializable');
  });

  it('applies defaultTxOptions resolved asynchronously via forRootAsync', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRootAsync({
        useFactory: async () => ({
          defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
        }),
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('repeatable read');
  });

  it('lets per-call @Transactional options override defaultTxOptions', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({
        defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.serializableIsolationLevel()).resolves.toBe('serializable');
    // The default still applies to calls that pass no per-call options.
    await expect(probe.currentIsolationLevel()).resolves.toBe('repeatable read');
  });

  // Regression for the review finding: the shared adapter used to keep app A's
  // defaultTxOptions when app B's factory resolved none.
  it('does not leak async defaultTxOptions across app compiles of one module', async () => {
    let txOptions: object | undefined = { isolationLevel: IsolationLevel.SERIALIZABLE };
    const sharedModule = TransactionalModule.forRootAsync({
      useFactory: async () => ({ defaultTxOptions: txOptions as any }),
    });

    moduleRef = await bootWith(sharedModule);
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'serializable',
    );
    await moduleRef.close();

    txOptions = undefined; // second app resolves NO defaults
    moduleRef = await bootWith(sharedModule);
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'read committed', // Postgres default — NOT the stale serializable
    );
  });
});

describe('forRoot({ enableTransactionProxy: true }) + @InjectTransaction (real Postgres)', () => {
  @Injectable()
  class TxProbe {
    constructor(
      @InjectRepository(Member) readonly repo: Repository<Member>,
      // The transaction instance itself — the current EntityManager, proxied.
      @InjectTransaction() readonly tx: Transaction<TransactionalAdapterTypeOrm>,
    ) {}

    @Transactional()
    async createViaTx(name: string): Promise<void> {
      await this.tx.save(Member, { name });
    }

    @Transactional()
    async createViaTxAndFail(name: string): Promise<void> {
      await this.tx.save(Member, { name });
      throw new Error('boom');
    }
  }

  let moduleRef: TestingModule;
  let probe: TxProbe;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(PG_A),
        TransactionalModule.forRoot({ enableTransactionProxy: true }),
        TransactionalModule.forFeature([Member]),
      ],
      providers: [TxProbe],
    }).compile();
    await moduleRef.init();
    probe = moduleRef.get(TxProbe);
  });

  beforeEach(() => probe.repo.clear());
  afterAll(() => moduleRef.close());

  it('writes made through the injected transaction commit with the method', async () => {
    await probe.createViaTx('a');
    await expect(probe.repo.count()).resolves.toBe(1);
  });

  it('writes made through the injected transaction roll back with the method', async () => {
    await expect(probe.createViaTxAndFail('a')).rejects.toThrow('boom');
    await expect(probe.repo.count()).resolves.toBe(0);
  });

  it('falls back to the base EntityManager outside a transaction', async () => {
    await probe.tx.save(Member, { name: 'plain' });
    await expect(probe.repo.count()).resolves.toBe(1);
  });
});
