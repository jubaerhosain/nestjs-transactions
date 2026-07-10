import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ClsModule, ClsService } from 'nestjs-cls';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

type Client = Prisma.TransactionClient;

@Injectable()
class TenantService {
  constructor(
    @InjectPrismaClient() private readonly prisma: Client,
    private readonly cls: ClsService,
  ) {}

  @Transactional()
  async createForTenant(name: string): Promise<string | undefined> {
    await this.prisma.author.create({ data: { name } });
    // Unrelated CLS state set by the host app must survive inside the transaction.
    return this.cls.get('tenant');
  }

  @Transactional()
  async createAndFail(name: string): Promise<void> {
    await this.prisma.author.create({ data: { name } });
    throw new Error('boom');
  }
}

describe('coexistence with a host app that owns ClsModule.forRoot (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: TenantService;
  let cls: ClsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // The host app owns the CLS root; our module registers its plugin via
        // ClsModule.registerPlugins (never forRoot), so the two compose.
        ClsModule.forRoot({ global: true }),
        PrismaModule,
        TransactionalModule.forRoot({
          prismaToken: PrismaService,
          sqlFlavor: 'postgresql',
          imports: [PrismaModule],
        }),
      ],
      providers: [TenantService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(TenantService);
    cls = moduleRef.get(ClsService);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.entry.deleteMany();
    await prisma.author.deleteMany();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('keeps host-app CLS state readable inside @Transactional() and commits', async () => {
    const tenant = await cls.run(async () => {
      cls.set('tenant', 'acme');
      return service.createForTenant('ada');
    });

    expect(tenant).toBe('acme');
    await expect(prisma.author.count()).resolves.toBe(1);
  });

  it('still rolls back the transaction under the host-owned ClsModule', async () => {
    await expect(cls.run(() => service.createAndFail('grace'))).rejects.toThrow('boom');
    await expect(prisma.author.count()).resolves.toBe(0);
  });
});
