import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { runOnTransactionCommit, runOnTransactionRollback } from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

const events: string[] = [];

const EXTENDED_PRISMA = 'EXTENDED_PRISMA';

function buildExtendedClient(prisma: PrismaService) {
  return prisma.$extends({
    model: {
      author: {
        async createShouting(name: string) {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            create: (args: { data: { name: string } }) => Promise<{ id: number; name: string }>;
          };
          return ctx.create({ data: { name: name.toUpperCase() } });
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildExtendedClient>;

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: EXTENDED_PRISMA,
      inject: [PrismaService],
      useFactory: buildExtendedClient,
    },
  ],
  exports: [EXTENDED_PRISMA],
})
class ExtendedPrismaModule {}

@Injectable()
class ShoutingService {
  constructor(@InjectPrismaClient() private readonly prisma: ExtendedClient) {}

  @Transactional()
  async createTwo(name: string, fail = false): Promise<void> {
    // Extension methods keep working through the transaction-aware proxy…
    await this.prisma.author.createShouting(name);
    // …alongside regular delegates on the same (transactional) client.
    await this.prisma.author.create({ data: { name: `${name}-plain` } });
    if (fail) {
      throw new Error('rollback');
    }
  }

  @Transactional()
  async createWithHooks(name: string, fail = false): Promise<void> {
    runOnTransactionCommit(() => {
      events.push('commit');
    });
    runOnTransactionRollback((error) => {
      events.push(`rollback:${error.message}`);
    });
    await this.prisma.author.createShouting(name);
    if (fail) {
      throw new Error('rollback');
    }
  }
}

/**
 * The `$extends`-ed client under a custom token — the escape hatch for Prisma 7
 * custom-output/extended clients: `prismaToken` can be any DI token and the
 * adapter/proxy only rely on the client's structure.
 */
describe('extended ($extends) client (integration)', () => {
  let moduleRef: TestingModule;
  let service: ShoutingService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        ExtendedPrismaModule,
        TransactionalModule.forRoot({
          prismaToken: EXTENDED_PRISMA,
          sqlFlavor: 'postgresql',
          imports: [ExtendedPrismaModule],
        }),
      ],
      providers: [ShoutingService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(ShoutingService);
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

  it('fires commit hooks for a transaction on the extended client', async () => {
    await service.createWithHooks('ada');
    expect(events).toEqual(['commit']);
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('fires rollback hooks when a transaction on the extended client throws', async () => {
    await expect(service.createWithHooks('ada', true)).rejects.toThrow('rollback');
    expect(events).toEqual(['rollback:rollback']);
    await expect(prisma.author.count()).resolves.toBe(0);
  });

  it('commits extension-method and plain writes together', async () => {
    await service.createTwo('ada');

    const names = (await prisma.author.findMany()).map((a) => a.name).sort();
    expect(names).toEqual(['ADA', 'ada-plain']);
  });

  it('rolls back extension-method writes with the transaction', async () => {
    await expect(service.createTwo('ada', true)).rejects.toThrow('rollback');
    await expect(prisma.author.count()).resolves.toBe(0);
  });
});
