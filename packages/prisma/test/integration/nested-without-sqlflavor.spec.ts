import { Injectable, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Propagation } from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

type Client = Prisma.TransactionClient;

@Injectable()
class Service {
  constructor(@InjectPrismaClient() private readonly prisma: Client) {}

  @Transactional({ propagation: Propagation.NESTED })
  async nestedWrite(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
  }

  @Transactional()
  async outerRollingBackAroundNested(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    await this.nestedWrite(`${name}-nested`);
    throw new Error('outer-boom');
  }
}

/**
 * Without `sqlFlavor` the adapter has no savepoint support, so `Propagation.NESTED`
 * cannot join the outer transaction: the upstream fallback runs the "nested"
 * block as an INDEPENDENT transaction (REQUIRES_NEW-like) and logs a warning.
 * This pins that surprising-but-documented behavior against a real database —
 * contrast with `transactional.spec.ts`, where `sqlFlavor: 'postgresql'` makes
 * the same call a true savepoint that rolls back with the outer transaction.
 */
describe('NESTED without sqlFlavor (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: Service;
  let prisma: PrismaService;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        PrismaModule,
        // No sqlFlavor on purpose.
        TransactionalModule.forRoot({ prismaToken: PrismaService, imports: [PrismaModule] }),
      ],
      providers: [Service],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(Service);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.entry.deleteMany();
    await prisma.author.deleteMany();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());
  afterAll(async () => {
    await moduleRef.close();
  });

  it('runs the NESTED block as an independent transaction that survives the outer rollback', async () => {
    await expect(service.outerRollingBackAroundNested('ada')).rejects.toThrow('outer-boom');

    // The outer write rolled back; the "nested" write committed independently.
    const names = (await prisma.author.findMany()).map((a) => a.name);
    expect(names).toEqual(['ada-nested']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Nested Propagation option is ignored'),
    );
  });
});
