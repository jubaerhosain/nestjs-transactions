import { DynamicModule, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import {
  InjectRepository,
  InjectTransaction,
  IsolationLevel,
  Transactional,
  TransactionalAdapterTypeOrm,
  TypeOrmModule,
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

async function bootWith(root: DynamicModule) {
  const moduleRef = await Test.createTestingModule({
    imports: [root, TypeOrmModule.forFeature([Member])],
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
      TypeOrmModule.forRoot({
        ...PG_A,
        defaultTxOptions: { isolationLevel: IsolationLevel.SERIALIZABLE },
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('serializable');
  });

  it('applies options resolved asynchronously via forRootAsync — factory runs ONCE', async () => {
    let factoryCalls = 0;
    moduleRef = await bootWith(
      TypeOrmModule.forRootAsync({
        useFactory: async () => {
          factoryCalls += 1;
          return {
            ...PG_A,
            defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
          };
        },
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('repeatable read');
    // Both the DataSource and the transactional plugin consumed the SAME
    // factory result — the shared options module deduped to one instance.
    expect(factoryCalls).toBe(1);
  });

  it('lets per-call @Transactional options override defaultTxOptions', async () => {
    moduleRef = await bootWith(
      TypeOrmModule.forRoot({
        ...PG_A,
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
    const sharedModule = TypeOrmModule.forRootAsync({
      useFactory: async () => ({ ...PG_A, defaultTxOptions: txOptions as any }),
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
        TypeOrmModule.forRoot({ ...PG_A, enableTransactionProxy: true }),
        TypeOrmModule.forFeature([Member]),
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
