import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { runOnTransactionCommit, runOnTransactionRollback } from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

const events: string[] = [];

/**
 * Two connections over the SAME database and PrismaClient: cheap way to prove
 * that named connections get independent physical transactions and hook
 * registries. (A second database would only change the datasource, not the
 * connection semantics under test.)
 */
@Injectable()
class CrossConnectionService {
  constructor(
    @InjectPrismaClient() private readonly prisma: Prisma.TransactionClient,
    @InjectPrismaClient('secondary') private readonly secondary: Prisma.TransactionClient,
  ) {}

  @Transactional({ connectionName: 'secondary' })
  async writeOnSecondary(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      events.push(`commit:secondary:${name}`);
    });
    await this.secondary.author.create({ data: { name } });
  }

  @Transactional()
  async defaultRollbackAroundSecondary(name: string): Promise<void> {
    runOnTransactionRollback((error) => {
      events.push(`rollback:default:${error.message}`);
    });
    await this.prisma.author.create({ data: { name } });
    await this.writeOnSecondary(`${name}-secondary`);
    throw new Error('default-boom');
  }
}

describe('cross-connection independence (integration)', () => {
  let moduleRef: TestingModule;
  let service: CrossConnectionService;
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
        TransactionalModule.forRoot({
          prismaToken: PrismaService,
          sqlFlavor: 'postgresql',
          imports: [PrismaModule],
          connectionName: 'secondary',
        }),
      ],
      providers: [CrossConnectionService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(CrossConnectionService);
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

  it("a named-connection transaction inside a default one is physically independent — the secondary write survives the default rollback, and each connection's hooks fire on its own outcome", async () => {
    await expect(service.defaultRollbackAroundSecondary('ada')).rejects.toThrow('default-boom');

    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-secondary']);

    expect(events).toContain('commit:secondary:ada-secondary');
    expect(events).toContain('rollback:default:default-boom');
    expect(events).not.toContain('rollback:secondary');
  });
});
