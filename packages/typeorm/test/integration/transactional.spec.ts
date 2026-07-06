import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IsolationLevel,
  Propagation,
  Transactional,
  TransactionalAdapterTypeOrm,
  TransactionalModule,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
} from '../../src';
import { Member, PG_A } from './fixtures';

@Injectable()
class OtherService {
  constructor(@InjectRepository(Member) private readonly repo: Repository<Member>) {}

  // Deliberately NOT decorated — must silently join the caller's transaction.
  async create(name: string): Promise<void> {
    await this.repo.save({ name });
  }
}

@Injectable()
class MemberService {
  constructor(
    @InjectRepository(Member) readonly repo: Repository<Member>,
    readonly other: OtherService,
    readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  @Transactional()
  async createAndFail(name: string): Promise<void> {
    await this.repo.save({ name });
    throw new Error('boom');
  }

  @Transactional()
  async createAcrossServices(a: string, b: string): Promise<void> {
    await this.repo.save({ name: a });
    await this.other.create(b);
  }

  @Transactional()
  async createAcrossServicesAndFail(a: string, b: string): Promise<void> {
    await this.repo.save({ name: a });
    await this.other.create(b);
    throw new Error('boom');
  }

  @Transactional(Propagation.RequiresNew)
  async createIndependently(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional(Propagation.Mandatory)
  async requiresExistingTx(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional(Propagation.Never)
  async mustRunWithoutTx(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional(Propagation.Nested)
  async createNested(name: string): Promise<void> {
    await this.repo.save({ name });
    throw new Error('nested boom');
  }

  @Transactional<TransactionalAdapterTypeOrm>({ isolationLevel: IsolationLevel.SERIALIZABLE })
  async currentIsolationLevel(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      'SELECT current_setting(\'transaction_isolation\') AS transaction_isolation',
    );
    return transaction_isolation;
  }
}

describe('@Transactional with silent repositories (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: MemberService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(PG_A),
        TransactionalModule.forRoot(),
        TransactionalModule.forFeature([Member]),
      ],
      providers: [MemberService, OtherService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(MemberService);
  });

  beforeEach(() => service.repo.clear());
  afterAll(() => moduleRef.close());

  it('rolls back repo.save when the decorated method throws', async () => {
    await expect(service.createAndFail('a')).rejects.toThrow('boom');
    await expect(service.repo.count()).resolves.toBe(0);
  });

  it('commits when the decorated method succeeds', async () => {
    await service.createAcrossServices('a', 'b');
    await expect(service.repo.count()).resolves.toBe(2);
  });

  it('propagates one transaction across services (both rows roll back together)', async () => {
    await expect(service.createAcrossServicesAndFail('a', 'b')).rejects.toThrow('boom');
    await expect(service.repo.count()).resolves.toBe(0);
  });

  it('works as a plain repository outside any transaction', async () => {
    await service.repo.save({ name: 'plain' });
    await expect(service.repo.findOneBy({ name: 'plain' })).resolves.toMatchObject({
      name: 'plain',
    });
  });

  describe('propagation modes', () => {
    it('RequiresNew commits independently of a rolled-back outer transaction', async () => {
      await expect(
        service.txHost.withTransaction(async () => {
          await service.repo.save({ name: 'outer' });
          await service.createIndependently('inner');
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['inner']);
    });

    it('Mandatory throws outside a transaction and joins one inside', async () => {
      // The propagation check happens before any async work starts.
      expect(() => service.requiresExistingTx('x')).toThrow(TransactionNotActiveError);

      await service.txHost.withTransaction(async () => {
        await service.requiresExistingTx('joined');
      });
      await expect(service.repo.count()).resolves.toBe(1);
    });

    it('Never throws inside a transaction and runs outside one', async () => {
      await expect(
        service.txHost.withTransaction(async () => service.mustRunWithoutTx('x')),
      ).rejects.toThrow(TransactionAlreadyActiveError);

      await service.mustRunWithoutTx('free');
      await expect(service.repo.count()).resolves.toBe(1);
    });

    it('Nested rolls back to a savepoint without killing the outer transaction', async () => {
      await service.txHost.withTransaction(async () => {
        await service.repo.save({ name: 'outer' });
        await expect(service.createNested('inner')).rejects.toThrow('nested boom');
      });

      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['outer']);
    });

    it('NotSupported suspends the transaction (write survives outer rollback)', async () => {
      await expect(
        service.txHost.withTransaction(async () => {
          await service.repo.save({ name: 'outer' });
          await service.txHost.withTransaction(Propagation.NotSupported, async () => {
            await service.repo.save({ name: 'suspended' });
          });
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['suspended']);
    });

    it('Supports joins a transaction when present and runs plainly when not', async () => {
      await service.txHost.withTransaction(Propagation.Supports, async () => {
        expect(service.txHost.isTransactionActive()).toBe(false);
      });
      await service.txHost.withTransaction(async () => {
        await service.txHost.withTransaction(Propagation.Supports, async () => {
          expect(service.txHost.isTransactionActive()).toBe(true);
        });
      });
    });
  });

  it('honors per-call isolation levels', async () => {
    await expect(service.currentIsolationLevel()).resolves.toBe('serializable');
  });

  // Regression for the review finding: spies used to land on the fallback
  // repository only and were silently bypassed inside transactions.
  it('jest.spyOn on the injected repository is honored inside @Transactional()', async () => {
    const spy = jest.spyOn(service.repo, 'save').mockResolvedValue({ id: 0, name: 'mock' } as Member);

    // Both services inject the same repository provider, so both saves inside
    // the transaction hit the spy — nothing reaches the database.
    await service.createAcrossServices('a', 'b');
    expect(spy).toHaveBeenCalledTimes(2);
    await expect(service.repo.count()).resolves.toBe(0);

    spy.mockRestore();
    await service.repo.save({ name: 'real-again' });
    await expect(service.repo.count()).resolves.toBe(1);
  });

  it('does not bleed transactions across concurrent invocations', async () => {
    const managers = new Set<unknown>();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        service.txHost.withTransaction(async () => {
          managers.add(service.txHost.tx);
          await service.repo.save({ name: `c${i}` });
          await new Promise((r) => setTimeout(r, 10 + (i % 3) * 10));
          await expect(service.repo.findOneBy({ name: `c${i}` })).resolves.not.toBeNull();
        }),
      ),
    );
    expect(managers.size).toBe(8);
    await expect(service.repo.count()).resolves.toBe(8);
  });
});
