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

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async createIndependently(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional({ propagation: Propagation.MANDATORY })
  async requiresExistingTx(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional({ propagation: Propagation.NEVER })
  async mustRunWithoutTx(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional({ propagation: Propagation.NESTED })
  async createNested(name: string): Promise<void> {
    await this.repo.save({ name });
    throw new Error('nested boom');
  }

  @Transactional({ propagation: Propagation.NESTED })
  async createNestedOk(name: string): Promise<void> {
    await this.repo.save({ name });
  }

  @Transactional({ propagation: Propagation.SUPPORTS })
  async createSupports(name: string): Promise<boolean> {
    await this.repo.save({ name });
    return this.txHost.isTransactionActive();
  }

  @Transactional({ propagation: Propagation.NOT_SUPPORTED })
  async createNotSupported(name: string): Promise<boolean> {
    await this.repo.save({ name });
    return this.txHost.isTransactionActive();
  }

  @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
  async currentIsolationLevel(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    return transaction_isolation;
  }

  // --- decorator-to-decorator nesting: both methods carry @Transactional, and
  // the inner one is reached through `this.` so it re-enters its own decorator. ---

  @Transactional()
  async outerRequiredInnerRequiresNew(outer: string, inner: string): Promise<void> {
    await this.repo.save({ name: outer });
    await this.createIndependently(inner); // REQUIRES_NEW — commits independently
    throw new Error('outer boom');
  }

  @Transactional()
  async outerSwallowsFailedNested(a: string, b: string, c: string): Promise<void> {
    await this.repo.save({ name: a });
    await this.createNested(b).catch(() => undefined); // NESTED throws → savepoint rollback
    await this.repo.save({ name: c }); // outer tx keeps going after the savepoint rollback
  }

  @Transactional()
  async outerRequiredInnerMandatory(outer: string, inner: string): Promise<void> {
    await this.repo.save({ name: outer });
    await this.requiresExistingTx(inner); // MANDATORY joins the outer tx
    throw new Error('outer boom');
  }

  @Transactional({
    propagation: Propagation.REQUIRES_NEW,
    isolationLevel: IsolationLevel.SERIALIZABLE,
  })
  async isolationInRequiresNew(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    return transaction_isolation;
  }

  @Transactional()
  async outerReadCommittedInnerSerializable(): Promise<{ outer: string; inner: string }> {
    const [{ transaction_isolation: outer }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    const inner = await this.isolationInRequiresNew();
    return { outer, inner };
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

    it('Nested (decorator) commits its savepoint when the method succeeds', async () => {
      await service.txHost.withTransaction(async () => {
        await service.repo.save({ name: 'outer' });
        await service.createNestedOk('inner');
      });

      const names = (await service.repo.find()).map((m) => m.name).sort();
      expect(names).toEqual(['inner', 'outer']);
    });

    it('Supports (decorator) runs plainly outside a tx and joins one inside', async () => {
      await expect(service.createSupports('free')).resolves.toBe(false);
      await expect(service.repo.count()).resolves.toBe(1);
      await service.repo.clear();

      await expect(
        service.txHost.withTransaction(async () => {
          await expect(service.createSupports('joined')).resolves.toBe(true);
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');
      // Joined the outer transaction, so it rolled back with it.
      await expect(service.repo.count()).resolves.toBe(0);
    });

    it('NotSupported (decorator) suspends the tx so the write survives outer rollback', async () => {
      await expect(
        service.txHost.withTransaction(async () => {
          await service.repo.save({ name: 'outer' });
          await expect(service.createNotSupported('suspended')).resolves.toBe(false);
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['suspended']);
    });

    it('NotSupported suspends the transaction (write survives outer rollback)', async () => {
      await expect(
        service.txHost.withTransaction(async () => {
          await service.repo.save({ name: 'outer' });
          await service.txHost.withTransaction(Propagation.NOT_SUPPORTED, async () => {
            await service.repo.save({ name: 'suspended' });
          });
          throw new Error('outer boom');
        }),
      ).rejects.toThrow('outer boom');

      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['suspended']);
    });

    it('Supports joins a transaction when present and runs plainly when not', async () => {
      await service.txHost.withTransaction(Propagation.SUPPORTS, async () => {
        expect(service.txHost.isTransactionActive()).toBe(false);
      });
      await service.txHost.withTransaction(async () => {
        await service.txHost.withTransaction(Propagation.SUPPORTS, async () => {
          expect(service.txHost.isTransactionActive()).toBe(true);
        });
      });
    });
  });

  it('honors per-call isolation levels', async () => {
    await expect(service.currentIsolationLevel()).resolves.toBe('serializable');
  });

  describe('nested @Transactional combinations (decorator-to-decorator)', () => {
    it('outer REQUIRED + inner REQUIRES_NEW: the inner commit survives the outer rollback', async () => {
      await expect(service.outerRequiredInnerRequiresNew('outer', 'inner')).rejects.toThrow(
        'outer boom',
      );
      const names = (await service.repo.find()).map((m) => m.name);
      expect(names).toEqual(['inner']);
    });

    it('outer REQUIRED + inner NESTED: a failed savepoint does not poison the outer tx', async () => {
      await service.outerSwallowsFailedNested('a', 'b', 'c');
      const names = (await service.repo.find()).map((m) => m.name).sort();
      // 'b' rolled back to its savepoint; 'a' (before) and 'c' (after) still commit.
      expect(names).toEqual(['a', 'c']);
    });

    it('outer REQUIRED + inner MANDATORY: the joined inner rolls back with the outer', async () => {
      await expect(service.outerRequiredInnerMandatory('outer', 'inner')).rejects.toThrow(
        'outer boom',
      );
      await expect(service.repo.count()).resolves.toBe(0);
    });

    it('{ propagation: REQUIRES_NEW, isolationLevel } opens an independent inner tx at that level', async () => {
      const { outer, inner } = await service.outerReadCommittedInnerSerializable();
      expect(outer).toBe('read committed'); // outer keeps the connection default
      expect(inner).toBe('serializable'); // inner tx begins at the requested level
    });
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
