import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Propagation } from '@nestjs-transactions/core';
import { Prisma } from '@prisma/client';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { PrismaModule, PrismaService } from './fixtures';

type Client = Prisma.TransactionClient;

@Injectable()
class InnerService {
  constructor(@InjectPrismaClient() private readonly prisma: Client) {}

  @Transactional()
  async addEntryRequired(authorId: number, title: string): Promise<void> {
    await this.prisma.entry.create({ data: { title, authorId } });
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
});
