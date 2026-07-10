import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectTransaction } from '@nestjs-transactions/core';
import type { Transaction } from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { IsolationLevel } from '../../src/isolation-level';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalAdapterPrisma } from '../../src/index';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

type Client = Prisma.TransactionClient;

async function isolationOf(prisma: Client): Promise<string> {
  const rows = await prisma.$queryRaw<
    { current_setting: string }[]
  >`SELECT current_setting('transaction_isolation')`;
  return rows[0].current_setting;
}

@Injectable()
class IsolationProbe {
  constructor(@InjectPrismaClient() private readonly prisma: Client) {}

  @Transactional()
  async currentIsolationLevel(): Promise<string> {
    return isolationOf(this.prisma);
  }

  // Per-call options must override the root defaultTxOptions for this one call.
  @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
  async serializableIsolationLevel(): Promise<string> {
    return isolationOf(this.prisma);
  }
}

async function bootWith(
  transactionalRoot: ReturnType<typeof TransactionalModule.forRoot>,
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, transactionalRoot],
    providers: [IsolationProbe],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

const ROOT = { prismaToken: PrismaService, imports: [PrismaModule] };

describe('forRoot options (real Postgres)', () => {
  let moduleRef: TestingModule;

  afterEach(() => moduleRef.close());

  it('applies defaultTxOptions from forRoot to every transaction', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({
        ...ROOT,
        defaultTxOptions: { isolationLevel: IsolationLevel.SERIALIZABLE },
      }),
    );
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'serializable',
    );
  });

  it('applies defaultTxOptions resolved asynchronously via forRootAsync', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRootAsync({
        ...ROOT,
        useFactory: async () => ({
          defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
        }),
      }),
    );
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'repeatable read',
    );
  });

  it('lets per-call @Transactional options override defaultTxOptions', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({
        ...ROOT,
        defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.serializableIsolationLevel()).resolves.toBe('serializable');
    // The default still applies to calls that pass no per-call options.
    await expect(probe.currentIsolationLevel()).resolves.toBe('repeatable read');
  });

  // Regression: the shared adapter must not keep app A's defaultTxOptions when
  // app B's async factory resolves none.
  it('does not leak async defaultTxOptions across app compiles of one module', async () => {
    let txOptions: object | undefined = { isolationLevel: IsolationLevel.SERIALIZABLE };
    const sharedModule = TransactionalModule.forRootAsync({
      ...ROOT,
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

  // Every IsolationLevel value is accepted and applied. Postgres reflects
  // the requested level in transaction_isolation (it enforces READ COMMITTED
  // semantics for READ UNCOMMITTED, since it has no dirty reads).
  it.each([
    [IsolationLevel.READ_UNCOMMITTED, 'read uncommitted'],
    [IsolationLevel.READ_COMMITTED, 'read committed'],
    [IsolationLevel.REPEATABLE_READ, 'repeatable read'],
    [IsolationLevel.SERIALIZABLE, 'serializable'],
  ])('applies isolation level %s at runtime → %s', async (level, expected) => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({ ...ROOT, defaultTxOptions: { isolationLevel: level } }),
    );
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(expected);
  });
});

describe('forRoot({ enableTransactionProxy: true }) + @InjectTransaction (real Postgres)', () => {
  @Injectable()
  class TxProbe {
    constructor(
      @InjectPrismaClient() readonly prisma: Client,
      // The transaction instance itself — the active Prisma transaction client.
      @InjectTransaction() readonly tx: Transaction<TransactionalAdapterPrisma>,
    ) {}

    @Transactional()
    async createViaTx(name: string): Promise<void> {
      await this.tx.author.create({ data: { name } });
    }

    @Transactional()
    async createViaTxAndFail(name: string): Promise<void> {
      await this.tx.author.create({ data: { name } });
      throw new Error('boom');
    }
  }

  let moduleRef: TestingModule;
  let probe: TxProbe;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        TransactionalModule.forRoot({ ...ROOT, enableTransactionProxy: true }),
      ],
      providers: [TxProbe],
    }).compile();
    await moduleRef.init();
    probe = moduleRef.get(TxProbe);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.entry.deleteMany();
    await prisma.author.deleteMany();
  });
  afterAll(() => moduleRef.close());

  it('writes made through the injected transaction commit with the method', async () => {
    await probe.createViaTx('a');
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('writes made through the injected transaction roll back with the method', async () => {
    await expect(probe.createViaTxAndFail('a')).rejects.toThrow('boom');
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('falls back to the base client outside a transaction', async () => {
    await probe.tx.author.create({ data: { name: 'plain' } });
    await expect(prisma.author.count()).resolves.toBe(1);
  });
});
