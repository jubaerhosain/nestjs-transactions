import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  runOnTransactionComplete,
  runOnTransactionCommit,
  runOnTransactionRollback,
} from '@nestjs-transactions/core';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { createNoOpPrismaTransactionalModule } from '../../src/testing';

const committed: string[] = [];

@Injectable()
class AuthorService {
  constructor(@InjectPrismaClient() private readonly prisma: any) {}

  @Transactional()
  async create(name: string): Promise<{ id: number }> {
    runOnTransactionCommit(() => {
      committed.push(name);
    });
    return this.prisma.author.create({ data: { name } });
  }
}

describe('createNoOpPrismaTransactionalModule', () => {
  beforeEach(() => committed.splice(0));

  it('satisfies @Transactional() and @InjectPrismaClient() over a mock client', async () => {
    const client = { author: { create: jest.fn().mockResolvedValue({ id: 42 }) } };
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule({ client })],
      providers: [AuthorService],
    }).compile();

    await expect(moduleRef.get(AuthorService).create('ada')).resolves.toEqual({ id: 42 });
    expect(client.author.create).toHaveBeenCalledWith({ data: { name: 'ada' } });
    // Hooks are wired in the no-op module too, so commit callbacks stay testable.
    expect(committed).toEqual(['ada']);
  });

  it('boots without a client for services that only need @Transactional()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule()],
      providers: [AuthorService],
    }).compile();

    expect(moduleRef.get(AuthorService)).toBeDefined();
  });

  it('fires rollback hooks when the decorated method throws', async () => {
    const rollbacks: string[] = [];

    @Injectable()
    class FailingService {
      @Transactional()
      async explode(): Promise<void> {
        runOnTransactionRollback((error) => {
          rollbacks.push(error.message);
        });
        throw new Error('boom');
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule()],
      providers: [FailingService],
    }).compile();

    await expect(moduleRef.get(FailingService).explode()).rejects.toThrow('boom');
    expect(rollbacks).toEqual(['boom']);
  });

  it('fires runOnTransactionComplete(undefined) on success in the no-op module', async () => {
    const completed: Array<Error | undefined> = [];

    @Injectable()
    class CompleteService {
      @Transactional()
      async run(): Promise<void> {
        runOnTransactionComplete((error) => {
          completed.push(error);
        });
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule()],
      providers: [CompleteService],
    }).compile();

    await moduleRef.get(CompleteService).run();
    expect(completed).toEqual([undefined]);
  });

  it('normalizes a non-Error throw to an Error for the rollback hook', async () => {
    const rollbacks: unknown[] = [];

    @Injectable()
    class NonErrorService {
      @Transactional()
      async explode(): Promise<void> {
        runOnTransactionRollback((error) => {
          rollbacks.push(error);
        });
        throw 'plain string failure';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule()],
      providers: [NonErrorService],
    }).compile();

    await expect(moduleRef.get(NonErrorService).explode()).rejects.toBe('plain string failure');
    expect(rollbacks).toHaveLength(1);
    expect(rollbacks[0]).toBeInstanceOf(Error);
    expect((rollbacks[0] as Error).message).toBe('plain string failure');
  });

  it("treats connectionName 'default' as the default connection", async () => {
    const client = { author: { create: jest.fn().mockResolvedValue({ id: 1 }) } };

    @Injectable()
    class DefaultNamedService {
      constructor(@InjectPrismaClient('default') private readonly prisma: any) {}

      @Transactional({ connectionName: 'default' })
      async create(name: string): Promise<{ id: number }> {
        return this.prisma.author.create({ data: { name } });
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule({ client, connectionName: 'default' })],
      providers: [DefaultNamedService],
    }).compile();

    await expect(moduleRef.get(DefaultNamedService).create('ada')).resolves.toEqual({ id: 1 });
  });

  it('supports a named connection end to end', async () => {
    const client = { author: { create: jest.fn().mockResolvedValue({ id: 7 }) } };

    @Injectable()
    class NamedService {
      constructor(@InjectPrismaClient('analytics') private readonly prisma: any) {}

      @Transactional({ connectionName: 'analytics' })
      async create(name: string): Promise<{ id: number }> {
        return this.prisma.author.create({ data: { name } });
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule({ client, connectionName: 'analytics' })],
      providers: [NamedService],
    }).compile();

    await expect(moduleRef.get(NamedService).create('grace')).resolves.toEqual({ id: 7 });
    expect(client.author.create).toHaveBeenCalledWith({ data: { name: 'grace' } });
  });
});
