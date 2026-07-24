import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { EntityTarget, ObjectLiteral } from 'typeorm';
import {
  InjectTransactionHost,
  IsolationLevel,
  NestjsTypeormModule,
  Propagation,
  runOnTransactionCommit,
  runOnTransactionRollback,
  Transactional,
  TransactionAlreadyActiveError,
  TransactionHost,
  TransactionNotActiveError,
  TypeOrmAdapter,
} from '../../src';
import { NestjsTypeormRepository } from '../../src/nestjs-typeorm.repository';
import { Member, PG_A, PG_B, Stat } from './fixtures';

// The sibling `transactional.spec.ts` sweeps the propagation modes through the
// plain injected `Repository<Member>`. THIS suite drives the same sweep through
// `NestjsTypeormRepository` subclasses — including an intermediate generic base
// repository — so every inherited `Repository` method (`save`, `findOneBy`,
// `createQueryBuilder`, `query`, …) is proven to follow the live `manager`
// accessor under every propagation mode of `@Transactional()`.

/** A user-style generic base shared by concrete repositories. */
abstract class BaseRepository<E extends ObjectLiteral> extends NestjsTypeormRepository<E> {
  constructor(entity: EntityTarget<E>, txHost: TransactionHost<TypeOrmAdapter>) {
    super(entity, txHost);
  }

  /** Query-builder helper on the GENERIC base — must ride the same live manager. */
  countAll(): Promise<number> {
    return this.createQueryBuilder('e').getCount();
  }
}

@Injectable()
class MemberRepository extends BaseRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  findByName(name: string): Promise<Member | null> {
    return this.findOneBy({ name });
  }

  /** Lifecycle hooks registered from INSIDE a repository method. */
  async saveWithHooks(name: string, events: string[]): Promise<void> {
    runOnTransactionCommit(() => {
      events.push('commit');
    });
    runOnTransactionRollback(() => {
      events.push('rollback');
    });
    await this.save({ name });
  }
}

/** Named connection through the same generic base — wired via the named host. */
@Injectable()
class StatRepository extends BaseRepository<Stat> {
  constructor(@InjectTransactionHost('stats') txHost: TransactionHost<TypeOrmAdapter>) {
    super(Stat, txHost);
  }
}

/** Carries mid-transaction observations out through a forced rollback. */
class ProbeError extends Error {
  constructor(readonly seen: Record<string, unknown>) {
    super('probe rollback');
  }
}

@Injectable()
class RepoService {
  constructor(
    readonly members: MemberRepository,
    readonly stats: StatRepository,
    readonly txHost: TransactionHost<TypeOrmAdapter>,
  ) {}

  // ---- REQUIRED (the default) ------------------------------------------------

  @Transactional()
  async requiredRollback(name: string): Promise<void> {
    await this.members.save({ name });
    throw new Error('boom');
  }

  @Transactional()
  async readThroughRepo(name: string): Promise<{ found: boolean; count: number }> {
    return {
      found: (await this.members.findByName(name)) !== null,
      count: await this.members.countAll(),
    };
  }

  // The inner REQUIRED call must JOIN: only then can its repo-driven reads see
  // the outer transaction's uncommitted row.
  @Transactional()
  async requiredJoinProbe(name: string): Promise<never> {
    await this.members.save({ name });
    throw new ProbeError(await this.readThroughRepo(name));
  }

  // ---- REQUIRES_NEW ----------------------------------------------------------

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async requiresNewWrite(name: string): Promise<void> {
    await this.members.save({ name });
  }

  @Transactional()
  async outerRollbackInnerRequiresNew(outerName: string, innerName: string): Promise<void> {
    await this.members.save({ name: outerName });
    await this.requiresNewWrite(innerName);
    throw new Error('outer boom');
  }

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async requiresNewProbe(name: string): Promise<{ foundInNewTx: boolean }> {
    return { foundInNewTx: (await this.members.findByName(name)) !== null };
  }

  // The repo inside the inner method must run on the NEW transaction's manager —
  // which cannot see the outer's uncommitted row (read committed).
  @Transactional()
  async outerWithRequiresNewProbe(name: string): Promise<never> {
    await this.members.save({ name });
    throw new ProbeError(await this.requiresNewProbe(name));
  }

  // ---- NESTED (savepoints) ---------------------------------------------------

  @Transactional({ propagation: Propagation.NESTED })
  async nestedWrite(name: string): Promise<void> {
    await this.members.save({ name });
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nestedWriteAndFail(name: string): Promise<void> {
    await this.members.save({ name });
    throw new Error('savepoint boom');
  }

  @Transactional()
  async outerWithSavepoint(outerName: string, innerName: string): Promise<void> {
    await this.members.save({ name: outerName });
    await this.nestedWrite(innerName);
  }

  @Transactional()
  async outerWithFailedSavepoint(outerName: string, innerName: string): Promise<void> {
    await this.members.save({ name: outerName });
    await this.nestedWriteAndFail(innerName).catch(() => undefined);
  }

  // ---- MANDATORY ---------------------------------------------------------------

  @Transactional({ propagation: Propagation.MANDATORY })
  async mandatoryProbe(name: string): Promise<{ found: boolean }> {
    return { found: (await this.members.findByName(name)) !== null };
  }

  @Transactional()
  async outerWithMandatory(name: string): Promise<never> {
    await this.members.save({ name });
    throw new ProbeError(await this.mandatoryProbe(name));
  }

  // ---- NEVER -------------------------------------------------------------------

  @Transactional({ propagation: Propagation.NEVER })
  async neverWrite(name: string): Promise<boolean> {
    await this.members.save({ name });
    return this.txHost.isTransactionActive();
  }

  @Transactional()
  async outerCallingNever(name: string): Promise<void> {
    await this.neverWrite(name);
  }

  // ---- SUPPORTS ------------------------------------------------------------------

  @Transactional({ propagation: Propagation.SUPPORTS })
  async supportsWrite(name: string): Promise<boolean> {
    await this.members.save({ name });
    return this.txHost.isTransactionActive();
  }

  @Transactional()
  async outerWithSupports(name: string): Promise<never> {
    throw new ProbeError({ active: await this.supportsWrite(name) });
  }

  // ---- NOT_SUPPORTED -----------------------------------------------------------

  @Transactional({ propagation: Propagation.NOT_SUPPORTED })
  async notSupportedWrite(name: string): Promise<boolean> {
    await this.members.save({ name });
    return this.txHost.isTransactionActive();
  }

  @Transactional()
  async outerRollbackWithNotSupported(outerName: string, innerName: string): Promise<never> {
    await this.members.save({ name: outerName });
    const active = await this.notSupportedWrite(innerName);
    throw new ProbeError({ activeInInner: active });
  }

  // ---- isolation level ---------------------------------------------------------

  @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
  async isolationProbe(): Promise<string> {
    const rows = await this.members.query('SHOW transaction_isolation');
    return rows[0].transaction_isolation;
  }

  // ---- lifecycle hooks (registered inside a repository method) ------------------

  @Transactional()
  async hookCommit(name: string, events: string[]): Promise<void> {
    await this.members.saveWithHooks(name, events);
  }

  @Transactional()
  async hookRollback(name: string, events: string[]): Promise<void> {
    await this.members.saveWithHooks(name, events);
    throw new Error('boom');
  }

  // ---- named connection ----------------------------------------------------------

  // A stats-connection transaction: the StatRepository (named host) must join
  // it; the default-connection MemberRepository must NOT — its live manager
  // stays on the default connection's fallback, so its write survives.
  @Transactional({ connectionName: 'stats' })
  async statsRollback(label: string, memberName: string): Promise<void> {
    await this.stats.save({ label });
    await this.members.save({ name: memberName });
    throw new Error('stats boom');
  }
}

describe('NestjsTypeormRepository subclasses under every propagation mode (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: RepoService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        NestjsTypeormModule.forRoot(PG_A),
        NestjsTypeormModule.forRoot({ ...PG_B, name: 'stats' }),
      ],
      providers: [MemberRepository, StatRepository, RepoService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(RepoService);
  });

  beforeEach(async () => {
    await service.members.clear();
    await service.stats.clear();
  });

  afterAll(() => moduleRef.close());

  describe('REQUIRED (default)', () => {
    it('rolls back writes made through inherited save()', async () => {
      await expect(service.requiredRollback('m1')).rejects.toThrow('boom');
      await expect(service.members.countAll()).resolves.toBe(0);
    });

    it('joins the outer transaction: inherited finder + query builder see the uncommitted row', async () => {
      const probe = await service.requiredJoinProbe('m1').catch((e: unknown) => e);

      expect(probe).toBeInstanceOf(ProbeError);
      expect(probe).toMatchObject({ seen: { found: true, count: 1 } });
      await expect(service.members.countAll()).resolves.toBe(0);
    });
  });

  describe('REQUIRES_NEW', () => {
    it('commits the inner write independently of the rolled-back outer', async () => {
      await expect(service.outerRollbackInnerRequiresNew('outer', 'inner')).rejects.toThrow(
        'outer boom',
      );

      await expect(service.members.findByName('outer')).resolves.toBeNull();
      await expect(service.members.findByName('inner')).resolves.toMatchObject({ name: 'inner' });
    });

    it("runs the repo on the NEW transaction's manager (cannot see the outer's uncommitted row)", async () => {
      const probe = await service.outerWithRequiresNewProbe('m1').catch((e: unknown) => e);

      expect(probe).toMatchObject({ seen: { foundInNewTx: false } });
      await expect(service.members.countAll()).resolves.toBe(0);
    });
  });

  describe('NESTED (savepoints)', () => {
    it('commits outer and savepoint writes together on success', async () => {
      await service.outerWithSavepoint('outer', 'inner');

      await expect(service.members.countAll()).resolves.toBe(2);
    });

    it('rolls back only to the savepoint on inner failure — the outer write commits', async () => {
      await service.outerWithFailedSavepoint('outer', 'inner');

      await expect(service.members.findByName('outer')).resolves.toMatchObject({ name: 'outer' });
      await expect(service.members.findByName('inner')).resolves.toBeNull();
    });
  });

  describe('MANDATORY', () => {
    it('throws TransactionNotActiveError when no transaction is active', () => {
      expect(() => service.mandatoryProbe('m1')).toThrow(TransactionNotActiveError);
    });

    it("joins the caller's transaction and sees its uncommitted row through the repo", async () => {
      const probe = await service.outerWithMandatory('m1').catch((e: unknown) => e);

      expect(probe).toMatchObject({ seen: { found: true } });
      await expect(service.members.countAll()).resolves.toBe(0);
    });
  });

  describe('NEVER', () => {
    it('throws TransactionAlreadyActiveError when called inside a transaction', async () => {
      await expect(service.outerCallingNever('m1')).rejects.toThrow(TransactionAlreadyActiveError);
    });

    it('runs the repo on the fallback manager outside a transaction', async () => {
      await expect(service.neverWrite('m1')).resolves.toBe(false);
      await expect(service.members.findByName('m1')).resolves.toMatchObject({ name: 'm1' });
    });
  });

  describe('SUPPORTS', () => {
    it('runs plainly (fallback manager, write persists) when no transaction is active', async () => {
      await expect(service.supportsWrite('m1')).resolves.toBe(false);
      await expect(service.members.findByName('m1')).resolves.toMatchObject({ name: 'm1' });
    });

    it('joins an active transaction, so the write rolls back with the outer', async () => {
      const probe = await service.outerWithSupports('m1').catch((e: unknown) => e);

      expect(probe).toMatchObject({ seen: { active: true } });
      await expect(service.members.countAll()).resolves.toBe(0);
    });
  });

  describe('NOT_SUPPORTED', () => {
    it('suspends the transaction: the repo write survives the outer rollback', async () => {
      const probe = await service
        .outerRollbackWithNotSupported('outer', 'inner')
        .catch((e: unknown) => e);

      // The live manager accessor tracked the suspension mid-CLS-context…
      expect(probe).toMatchObject({ seen: { activeInInner: false } });
      // …so the inner write went to the base manager and survived the rollback.
      await expect(service.members.findByName('outer')).resolves.toBeNull();
      await expect(service.members.findByName('inner')).resolves.toMatchObject({ name: 'inner' });
    });
  });

  describe('isolation level', () => {
    it('applies the decorator isolationLevel to inherited query()', async () => {
      await expect(service.isolationProbe()).resolves.toBe('serializable');
    });
  });

  describe('withTransaction (programmatic form)', () => {
    it('drives inherited repo methods exactly like the decorator', async () => {
      const seen = await service.txHost
        .withTransaction(Propagation.REQUIRES_NEW, async () => {
          await service.members.save({ name: 'wt' });
          const found = (await service.members.findByName('wt')) !== null;
          throw new ProbeError({ found });
        })
        .catch((e: unknown) => e);

      expect(seen).toMatchObject({ seen: { found: true } });
      await expect(service.members.findByName('wt')).resolves.toBeNull();
    });
  });

  describe('lifecycle hooks registered inside a repository method', () => {
    it('fires commit hooks after the transaction commits', async () => {
      const events: string[] = [];

      await service.hookCommit('m1', events);

      expect(events).toEqual(['commit']);
      await expect(service.members.findByName('m1')).resolves.toMatchObject({ name: 'm1' });
    });

    it('fires rollback hooks after the transaction rolls back', async () => {
      const events: string[] = [];

      await expect(service.hookRollback('m1', events)).rejects.toThrow('boom');

      expect(events).toEqual(['rollback']);
      await expect(service.members.countAll()).resolves.toBe(0);
    });
  });

  describe('named connection', () => {
    it('a named-host repo joins its own connection; a default-host repo stays off it', async () => {
      await expect(service.statsRollback('s1', 'm1')).rejects.toThrow('stats boom');

      // The stats write rolled back with the stats transaction…
      await expect(service.stats.countAll()).resolves.toBe(0);
      // …while the default-connection repo wrote outside any transaction.
      await expect(service.members.findByName('m1')).resolves.toMatchObject({ name: 'm1' });
    });
  });
});
