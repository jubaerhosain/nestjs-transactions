import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Propagation,
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
} from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

const events: string[] = [];

function registerHooks(label: string): void {
  runOnTransactionCommit(() => {
    events.push(`commit:${label}`);
  });
  runOnTransactionRollback((error) => {
    events.push(`rollback:${label}:${error.message}`);
  });
}

@Injectable()
class AuthorService {
  constructor(@InjectPrismaClient() private readonly prisma: Prisma.TransactionClient) {}

  @Transactional()
  async create(name: string, fail = false): Promise<void> {
    runOnTransactionCommit(() => {
      events.push(`commit:${name}`);
    });
    runOnTransactionRollback((error) => {
      events.push(`rollback:${name}:${error.message}`);
    });
    runOnTransactionComplete((error) => {
      events.push(`complete:${name}:${error?.message ?? 'ok'}`);
    });
    await this.prisma.author.create({ data: { name } });
    if (fail) {
      throw new Error('boom');
    }
  }

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async innerRequiresNew(name: string): Promise<void> {
    registerHooks('inner');
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional()
  async outerRollbackWithRequiresNew(name: string): Promise<void> {
    registerHooks('outer');
    await this.prisma.author.create({ data: { name } });
    await this.innerRequiresNew(`${name}-independent`);
    throw new Error('outer-boom');
  }

  @Transactional({ propagation: Propagation.NESTED })
  async innerNested(name: string, fail: boolean): Promise<void> {
    registerHooks('nested');
    await this.prisma.author.create({ data: { name } });
    if (fail) {
      throw new Error('savepoint-boom');
    }
  }

  @Transactional()
  async outerWithFailingNested(name: string): Promise<void> {
    registerHooks('outer');
    await this.prisma.author.create({ data: { name } });
    await this.innerNested(`${name}-nested`, true).catch(() => undefined);
  }

  @Transactional()
  async outerWithSucceedingNested(name: string): Promise<void> {
    registerHooks('outer');
    await this.prisma.author.create({ data: { name } });
    await this.innerNested(`${name}-nested`, false);
  }

  @Transactional({ propagation: Propagation.NEVER })
  async registerWhileNever(): Promise<void> {
    registerHooks('never');
  }

  @Transactional()
  async outerRegisteringThenJoined(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      events.push('commit:outer');
    });
    await this.prisma.author.create({ data: { name } });
    await this.registerFromJoined();
  }

  @Transactional()
  async joinedInner(name: string, fail = false): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.registerFromJoined();
    if (fail) {
      throw new Error('outer-boom');
    }
  }

  @Transactional()
  async registerFromJoined(): Promise<void> {
    registerHooks('joined');
  }

  @Transactional({ propagation: Propagation.NOT_SUPPORTED })
  async registerWhileSuspended(): Promise<void> {
    registerHooks('suspended');
  }

  @Transactional()
  async callSuspendedRegistration(): Promise<void> {
    await this.registerWhileSuspended();
  }

  @Transactional()
  async createThenWriteFromCommitHook(name: string): Promise<void> {
    // The transaction client is closed by the time commit hooks run; the
    // injected proxy must resolve back to the base client there.
    runOnTransactionCommit(async () => {
      await this.prisma.author.create({ data: { name: `${name}-from-hook` } });
      events.push(`hook-write:${name}`);
    });
    await this.prisma.author.create({ data: { name } });
  }
}

// The full hook semantics (ordering, propagation modes, error normalization)
// are covered in core and typeorm suites; this is the Prisma smoke test.
describe('transaction hooks with Prisma (integration)', () => {
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
      providers: [AuthorService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(AuthorService);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    events.splice(0);
    await prisma.entry.deleteMany();
    await prisma.author.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('fires commit then complete after the transaction commits', async () => {
    await service.create('ada');
    expect(events).toEqual(['commit:ada', 'complete:ada:ok']);
  });

  it('fires rollback then complete (with the error) after the transaction rolls back', async () => {
    await expect(service.create('ada', true)).rejects.toThrow('boom');
    expect(events).toEqual(['rollback:ada:boom', 'complete:ada:boom']);
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('REQUIRES_NEW: inner commit hooks fire although the outer rolls back — no cross-firing', async () => {
    await expect(service.outerRollbackWithRequiresNew('ada')).rejects.toThrow('outer-boom');

    expect(events).toContain('commit:inner');
    expect(events).toContain('rollback:outer:outer-boom');
    expect(events).not.toContain('rollback:inner:outer-boom');
    expect(events).not.toContain('commit:outer');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-independent']);
  });

  it("NESTED: the savepoint's rollback hooks fire on its own outcome while the outer commits", async () => {
    await service.outerWithFailingNested('ada');

    expect(events).toContain('rollback:nested:savepoint-boom');
    expect(events).toContain('commit:outer');
    expect(events).not.toContain('commit:nested');
    expect(events).not.toContain('rollback:outer:savepoint-boom');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada']);
  });

  it('joined REQUIRED: hooks registered in the inner method settle with the outer transaction', async () => {
    await service.joinedInner('ada');
    expect(events).toContain('commit:joined');

    events.splice(0);
    await expect(service.joinedInner('grace', true)).rejects.toThrow('outer-boom');
    expect(events).toContain('rollback:joined:outer-boom');
    expect(events).not.toContain('commit:joined');
  });

  it('registering a hook outside any transaction throws', () => {
    expect(() => registerHooks('nowhere')).toThrow(/No active transaction/);
  });

  it('registering a hook inside a suspended NOT_SUPPORTED scope throws', async () => {
    await expect(service.callSuspendedRegistration()).rejects.toThrow(/No active transaction/);
  });

  it('registering a hook inside a NEVER top-level method throws', async () => {
    await expect(service.registerWhileNever()).rejects.toThrow(/No active transaction/);
  });

  it('NESTED success: the savepoint commit hook fires before the outer commit', async () => {
    await service.outerWithSucceedingNested('ada');

    // Savepoint release settles first, then the enclosing transaction commits.
    expect(events).toEqual(['commit:nested', 'commit:outer']);
    const names = (await prisma.author.findMany()).map((a) => a.name).sort();
    expect(names).toEqual(['ada', 'ada-nested']);
  });

  it('joined REQUIRED: hooks fire in registration order on the single outer commit', async () => {
    await service.outerRegisteringThenJoined('ada');

    // Outer hook registered first, joined-inner hook second — one shared registry.
    expect(events).toEqual(['commit:outer', 'commit:joined']);
  });

  it('a commit hook can write through the injected client (base client, post-commit)', async () => {
    await service.createThenWriteFromCommitHook('ada');

    expect(events).toContain('hook-write:ada');
    const names = (await prisma.author.findMany()).map((a) => a.name).sort();
    expect(names).toEqual(['ada', 'ada-from-hook']);
  });
});
