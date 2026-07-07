import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
});
