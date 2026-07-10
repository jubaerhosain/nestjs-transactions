import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Propagation,
  TransactionAlreadyActiveError,
  TransactionNotActiveError,
} from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

type Client = Prisma.TransactionClient;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
class InnerService {
  constructor(@InjectPrismaClient() private readonly prisma: Client) {}

  @Transactional()
  async addEntryRequired(authorId: number, title: string): Promise<void> {
    await this.prisma.entry.create({ data: { title, authorId } });
  }

  @Transactional({ propagation: Propagation.MANDATORY })
  async addAuthorMandatory(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional({ propagation: Propagation.NEVER })
  async addAuthorNever(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional({ propagation: Propagation.SUPPORTS })
  async addAuthorSupports(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nestedCallingRequired(name: string, fail: boolean): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    // REQUIRED inside the savepoint scope joins it.
    const author = await this.prisma.author.findFirstOrThrow({ where: { name } });
    await this.addEntryRequired(author.id, `${name}-entry`);
    if (fail) {
      throw new Error('nested-rollback');
    }
  }

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async addAuthorRequiresNew(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional({ propagation: Propagation.NESTED })
  async addAuthorNested(name: string, fail = false): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    if (fail) {
      throw new Error('nested-rollback');
    }
  }

  @Transactional({ propagation: Propagation.NOT_SUPPORTED })
  async addAuthorOutsideTx(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }
}

@Injectable()
class AuthorService {
  constructor(
    @InjectPrismaClient() private readonly prisma: Client,
    private readonly inner: InnerService,
  ) {}

  @Transactional()
  async createWithEntry(name: string, title: string, fail = false): Promise<void> {
    const author = await this.prisma.author.create({ data: { name } });
    await this.prisma.entry.create({ data: { title, authorId: author.id } });
    if (fail) {
      throw new Error('rollback');
    }
  }

  @Transactional()
  async createJoiningInner(name: string, fail = false): Promise<void> {
    const author = await this.prisma.author.create({ data: { name } });
    await this.inner.addEntryRequired(author.id, `${name}-entry`);
    if (fail) {
      throw new Error('rollback');
    }
  }

  @Transactional()
  async createWithRequiresNew(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.inner.addAuthorRequiresNew(`${name}-independent`);
    throw new Error('rollback');
  }

  @Transactional()
  async createWithNestedFailure(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.inner.addAuthorNested(`${name}-nested`, true).catch(() => undefined);
  }

  @Transactional()
  async createWithNotSupported(name: string): Promise<void> {
    await this.inner.addAuthorOutsideTx(`${name}-outside`);
    await this.prisma.author.create({ data: { name } });
    throw new Error('rollback');
  }

  @Transactional({ isolationLevel: 'Serializable', timeout: 15_000 })
  async createSerializable(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional()
  async callMandatory(name: string, fail = false): Promise<void> {
    await this.inner.addAuthorMandatory(name);
    if (fail) {
      throw new Error('rollback');
    }
  }

  @Transactional()
  async callNever(name: string): Promise<void> {
    await this.inner.addAuthorNever(name);
  }

  @Transactional()
  async callSupports(name: string): Promise<void> {
    await this.inner.addAuthorSupports(name);
    throw new Error('rollback');
  }

  @Transactional()
  async createWithNestedSuccess(name: string, failAfter = false): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.inner.addAuthorNested(`${name}-nested`);
    if (failAfter) {
      throw new Error('rollback');
    }
  }

  @Transactional()
  async deepNesting(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    // REQUIRED → NESTED (fails) → REQUIRED: everything inside the savepoint
    // scope — including the innermost joined REQUIRED write — must revert,
    // while this outer write commits.
    await this.inner.nestedCallingRequired(`${name}-nested`, true).catch(() => undefined);
  }

  @Transactional({ isolationLevel: 'Serializable' })
  async reportIsolationLevel(): Promise<string> {
    const rows = await this.prisma.$queryRaw<
      { current_setting: string }[]
    >`SELECT current_setting('transaction_isolation')`;
    return rows[0].current_setting;
  }

  @Transactional({ timeout: 500 })
  async outliveTimeout(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await sleep(1_200);
    // A query after expiry surfaces the transaction-closed error even if the
    // sleep alone did not.
    await this.prisma.author.count();
  }

  @Transactional()
  async createAndReportTxId(name: string): Promise<string> {
    await this.prisma.author.create({ data: { name } });
    // txid_current() assigns (and returns) a real, unique xid once the tx has
    // written — a faithful per-transaction identity from Postgres itself.
    const rows = await this.prisma.$queryRaw<
      { txid: string }[]
    >`SELECT txid_current()::text AS txid`;
    return rows[0].txid;
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nestedContainingRequiresNew(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name: `${name}-nested` } });
    await this.inner.addAuthorRequiresNew(`${name}-rn`);
  }

  @Transactional()
  async requiresNewInsideNested(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.nestedContainingRequiresNew(name);
    throw new Error('rollback');
  }

  @Transactional()
  async staggeredCreate(name: string, delayMs: number, fail = false): Promise<void> {
    const author = await this.prisma.author.create({ data: { name } });
    await sleep(delayMs);
    if (fail) {
      throw new Error(`rollback-${name}`);
    }
    // Second write after the interleaving sleep: proves this call still sees
    // its own transaction client despite concurrent transactions in flight.
    await this.prisma.entry.create({ data: { title: `${name}-entry`, authorId: author.id } });
  }
}

describe('@Transactional with Prisma (integration)', () => {
  let moduleRef: TestingModule;
  let service: AuthorService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        TransactionalModule.forRoot({
          prismaToken: PrismaService,
          sqlFlavor: 'postgresql',
          imports: [PrismaModule],
        }),
      ],
      providers: [AuthorService, InnerService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(AuthorService);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.entry.deleteMany();
    await prisma.author.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('commits: both writes through the injected client persist', async () => {
    await service.createWithEntry('ada', 'On Computable Numbers');

    await expect(prisma.author.count()).resolves.toBe(1);
    await expect(prisma.entry.count()).resolves.toBe(1);
  });

  it('rolls back both writes when the method throws', async () => {
    await expect(service.createWithEntry('ada', 'draft', true)).rejects.toThrow('rollback');

    await expect(prisma.author.count()).resolves.toBe(0);
    await expect(prisma.entry.count()).resolves.toBe(0);
  });

  it('REQUIRED (default): a nested decorated call joins the outer transaction', async () => {
    await expect(service.createJoiningInner('ada', true)).rejects.toThrow('rollback');
    await expect(prisma.author.count()).resolves.toBe(0);
    await expect(prisma.entry.count()).resolves.toBe(0);

    await service.createJoiningInner('grace');
    await expect(prisma.author.count()).resolves.toBe(1);
    await expect(prisma.entry.count()).resolves.toBe(1);
  });

  it('REQUIRES_NEW: the inner transaction commits independently of the outer rollback', async () => {
    await expect(service.createWithRequiresNew('ada')).rejects.toThrow('rollback');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-independent']);
  });

  it('NESTED: a failed savepoint rolls back alone; the outer transaction commits', async () => {
    await service.createWithNestedFailure('ada');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada']);
  });

  it('NOT_SUPPORTED: the suspended write persists despite the outer rollback', async () => {
    await expect(service.createWithNotSupported('ada')).rejects.toThrow('rollback');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-outside']);
  });

  it('passes per-call isolationLevel/timeout through to $transaction', async () => {
    await expect(service.createSerializable('ada')).resolves.toBeUndefined();
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('MANDATORY: rejects with TransactionNotActiveError when no transaction is active', async () => {
    const inner = moduleRef.get(InnerService);
    await expect(async () => inner.addAuthorMandatory('ada')).rejects.toThrow(
      TransactionNotActiveError,
    );
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('MANDATORY: joins the caller transaction and rolls back with it', async () => {
    await service.callMandatory('ada');
    await expect(prisma.author.count()).resolves.toBe(1);

    await expect(service.callMandatory('grace', true)).rejects.toThrow('rollback');
    await expect(prisma.author.count()).resolves.toBe(1); // still only 'ada'
  });

  it('NEVER: rejects with TransactionAlreadyActiveError inside a transaction, works standalone', async () => {
    await expect(service.callNever('ada')).rejects.toThrow(TransactionAlreadyActiveError);
    await expect(prisma.author.count()).resolves.toBe(0);

    const inner = moduleRef.get(InnerService);
    await inner.addAuthorNever('ada');
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('SUPPORTS: joins the caller transaction (write reverted on rollback), works standalone', async () => {
    await expect(service.callSupports('ada')).rejects.toThrow('rollback');
    await expect(prisma.author.count()).resolves.toBe(0);

    const inner = moduleRef.get(InnerService);
    await inner.addAuthorSupports('ada');
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('NESTED success: the released savepoint commits with the outer transaction', async () => {
    await service.createWithNestedSuccess('ada');

    const names = (await prisma.author.findMany()).map((a) => a.name).sort();
    expect(names).toEqual(['ada', 'ada-nested']);
  });

  it('NESTED success + outer rollback: the released savepoint write is reverted too', async () => {
    await expect(service.createWithNestedSuccess('ada', true)).rejects.toThrow('rollback');
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('deep nesting REQUIRED → NESTED → REQUIRED: savepoint failure reverts only savepoint-scoped writes', async () => {
    await service.deepNesting('ada');

    // The savepoint scope (nested author + the joined REQUIRED entry) reverted;
    // the outer write committed.
    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada']);
    await expect(prisma.entry.count()).resolves.toBe(0);
  });

  it('really applies the requested isolation level in Postgres', async () => {
    await expect(service.reportIsolationLevel()).resolves.toBe('serializable');
  });

  it('P2028: a transaction outliving its timeout rejects and rolls back', async () => {
    await expect(service.outliveTimeout('ada')).rejects.toMatchObject({ code: 'P2028' });
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('parallel transactions stay isolated per CLS context', async () => {
    const results = await Promise.allSettled([
      service.staggeredCreate('c1', 150),
      service.staggeredCreate('c2', 50, true),
      service.staggeredCreate('c3', 100),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);

    const authors = (await prisma.author.findMany()).map((a) => a.name).sort();
    expect(authors).toEqual(['c1', 'c3']);
    const entries = (await prisma.entry.findMany()).map((e) => e.title).sort();
    expect(entries).toEqual(['c1-entry', 'c3-entry']);
  });

  it('gives each concurrent invocation its own physical transaction (distinct txids)', async () => {
    const names = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const txids = await Promise.all(names.map((n) => service.createAndReportTxId(n)));

    // No transaction bleed: every concurrent call ran in a distinct Postgres tx.
    expect(new Set(txids).size).toBe(names.length);
    await expect(prisma.author.count()).resolves.toBe(names.length);
  });

  it('REQUIRES_NEW nested inside NESTED commits independently of the outer rollback', async () => {
    await expect(service.requiresNewInsideNested('ada')).rejects.toThrow('rollback');

    // The REQUIRES_NEW write committed on its own; the outer write and the
    // savepoint-scoped nested write both rolled back with the outer transaction.
    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-rn']);
  });
});
