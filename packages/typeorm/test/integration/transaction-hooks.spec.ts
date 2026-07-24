import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import {
  InjectRepository,
  NestjsTypeormModule,
  Propagation,
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
  Transactional,
  TransactionalAdapterTypeOrm,
  TransactionHost,
} from '../../src';
import { Member, PG_A, PG_B, Stat } from './fixtures';

@Injectable()
class HookService {
  events: string[] = [];
  rollbackErr: Error | 'unset' = 'unset';
  completeErr: Error | undefined | 'unset' = 'unset';
  commitCount = -1;
  commitHookError: unknown = 'unset';

  constructor(
    @InjectRepository(Member) readonly repo: Repository<Member>,
    readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  // A commit hook that does repository work: the physical tx has committed and
  // its query runner is released, so this must run on the base connection.
  @Transactional()
  async createThenQueryInCommitHook(name: string): Promise<void> {
    runOnTransactionCommit(async () => {
      try {
        this.commitCount = await this.repo.count();
      } catch (err) {
        this.commitHookError = err;
      }
    });
    await this.repo.save({ name });
  }

  @Transactional({ propagation: Propagation.NOT_SUPPORTED })
  async suspendedRegistersHook(): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('should-not-register');
    });
  }

  @Transactional()
  async outerCallsSuspended(): Promise<unknown> {
    await this.repo.save({ name: 'outer' });
    try {
      await this.suspendedRegistersHook();
      return 'no-throw';
    } catch (err) {
      return err;
    }
  }

  // NEVER runs `withoutTransaction` only at top level (nesting it inside an
  // active tx throws before the body runs), so this exercises the suspended-scope
  // guard on the NEVER path.
  @Transactional({ propagation: Propagation.NEVER })
  async neverRegistersHook(): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('should-not-register');
    });
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nestedFailsWithHooks(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('nested-commit');
    });
    runOnTransactionRollback(() => {
      this.events.push('nested-rollback');
    });
    await this.repo.save({ name });
    throw new Error('nested boom');
  }

  @Transactional()
  async outerSwallowsFailedNestedWithHooks(a: string, b: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('outer-commit');
    });
    await this.repo.save({ name: a });
    await this.nestedFailsWithHooks(b).catch(() => undefined); // savepoint rolls back
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nestedSucceedsWithHook(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('nested-commit');
    });
    await this.repo.save({ name });
  }

  @Transactional()
  async outerCommitsAfterNestedSucceeds(a: string, b: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('outer-commit');
    });
    await this.repo.save({ name: a });
    await this.nestedSucceedsWithHook(b); // savepoint released before the outer commits
  }

  @Transactional()
  async createWithHooks(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('commit');
    });
    runOnTransactionRollback(() => {
      this.events.push('rollback');
    });
    runOnTransactionComplete((err) => {
      this.events.push('complete');
      this.completeErr = err;
    });
    await this.repo.save({ name });
  }

  @Transactional()
  async createAndFailWithHooks(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('commit');
    });
    runOnTransactionRollback((err) => {
      this.events.push('rollback');
      this.rollbackErr = err;
    });
    runOnTransactionComplete((err) => {
      this.events.push('complete');
      this.completeErr = err;
    });
    await this.repo.save({ name });
    throw new Error('boom');
  }

  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  async innerRequiresNew(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('inner-commit');
    });
    await this.repo.save({ name });
  }

  @Transactional()
  async outerFailsAfterInnerRequiresNew(outer: string, inner: string): Promise<void> {
    runOnTransactionRollback(() => {
      this.events.push('outer-rollback');
    });
    await this.repo.save({ name: outer });
    await this.innerRequiresNew(inner); // commits independently
    throw new Error('outer boom');
  }

  @Transactional()
  async innerRequired(name: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('inner-commit');
    });
    await this.repo.save({ name });
  }

  @Transactional()
  async outerJoinsInnerRequired(outer: string, inner: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('outer-commit');
    });
    await this.repo.save({ name: outer });
    await this.innerRequired(inner); // REQUIRED — joins the outer transaction
  }
}

describe('transaction hooks (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: HookService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [NestjsTypeormModule.forRoot(PG_A), NestjsTypeormModule.forFeature([Member])],
      providers: [HookService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(HookService);
  });

  beforeEach(async () => {
    await service.repo.clear();
    service.events = [];
    service.rollbackErr = 'unset';
    service.completeErr = 'unset';
    service.commitCount = -1;
    service.commitHookError = 'unset';
  });
  afterAll(() => moduleRef.close());

  it('fires commit then complete(undefined) after a successful commit', async () => {
    await service.createWithHooks('a');

    expect(service.events).toEqual(['commit', 'complete']);
    expect(service.completeErr).toBeUndefined();
    // The row is durably committed.
    await expect(service.repo.count()).resolves.toBe(1);
  });

  it('fires rollback then complete(error) on failure and leaves no data', async () => {
    await expect(service.createAndFailWithHooks('a')).rejects.toThrow('boom');

    expect(service.events).toEqual(['rollback', 'complete']);
    expect(service.events).not.toContain('commit');
    expect(service.rollbackErr).toBeInstanceOf(Error);
    expect((service.rollbackErr as Error).message).toBe('boom');
    expect(service.completeErr).toBeInstanceOf(Error);
    await expect(service.repo.count()).resolves.toBe(0);
  });

  it('REQUIRES_NEW inner hooks fire independently of the rolled-back outer', async () => {
    await expect(service.outerFailsAfterInnerRequiresNew('outer', 'inner')).rejects.toThrow(
      'outer boom',
    );

    // Inner physical tx committed (and fired its hook) before the outer rolled back.
    expect(service.events).toEqual(['inner-commit', 'outer-rollback']);
    const names = (await service.repo.find()).map((m) => m.name);
    expect(names).toEqual(['inner']);
  });

  it('REQUIRED-joined inner hook fires on the outer commit', async () => {
    await service.outerJoinsInnerRequired('outer', 'inner');

    // Both hooks share the outer transaction's registry and fire on its single
    // commit, in registration order (outer registers before it calls the inner).
    expect(service.events).toEqual(['outer-commit', 'inner-commit']);
    const names = (await service.repo.find()).map((m) => m.name).sort();
    expect(names).toEqual(['inner', 'outer']);
  });

  it('lets a commit hook use the repository (runs on the base connection, not the released tx)', async () => {
    await service.createThenQueryInCommitHook('a');

    // The hook ran without hitting a released query runner and saw the committed row.
    expect(service.commitHookError).toBe('unset');
    expect(service.commitCount).toBe(1);
  });

  it('throws when a hook is registered in a suspended (NOT_SUPPORTED) inner method', async () => {
    const outcome = await service.outerCallsSuspended();

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/No active transaction/);
    expect(service.events).not.toContain('should-not-register');
    // The outer transaction still commits normally.
    await expect(service.repo.count()).resolves.toBe(1);
  });

  it('throws when a hook is registered in a suspended (NEVER) top-level method', async () => {
    await expect(service.neverRegistersHook()).rejects.toThrow(/No active transaction/);

    expect(service.events).not.toContain('should-not-register');
  });

  it('fires a NESTED savepoint rollback hook (not its commit hook) when the savepoint rolls back', async () => {
    await service.outerSwallowsFailedNestedWithHooks('a', 'b');

    // The savepoint rolled back → nested-rollback fires, nested-commit does not.
    expect(service.events).toContain('nested-rollback');
    expect(service.events).not.toContain('nested-commit');
    // The outer transaction still commits and fires its own commit hook.
    expect(service.events).toContain('outer-commit');
    const names = (await service.repo.find()).map((m) => m.name);
    expect(names).toEqual(['a']); // 'b' rolled back with the savepoint
  });

  it('fires a NESTED savepoint commit hook on savepoint release, before the outer commit', async () => {
    await service.outerCommitsAfterNestedSucceeds('a', 'b');

    // The nested block owns its registry and fires on the savepoint release, which
    // happens before the outer physical commit.
    expect(service.events).toEqual(['nested-commit', 'outer-commit']);
    const names = (await service.repo.find()).map((m) => m.name).sort();
    expect(names).toEqual(['a', 'b']); // both durably committed
  });
});

@Injectable()
class CrossConnectionHookService {
  events: string[] = [];

  constructor(
    @InjectRepository(Member) readonly members: Repository<Member>,
    @InjectRepository(Stat, 'stats') readonly stats: Repository<Stat>,
  ) {}

  // Runs on the NAMED 'stats' connection — its own physical transaction.
  @Transactional({ connectionName: 'stats' })
  async recordStatWithHook(label: string): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('stats-commit');
    });
    await this.stats.save({ label });
  }

  // Default-connection outer that commits an independent stats transaction, then
  // rolls itself back.
  @Transactional()
  async writeMemberThenRecordStatThenFail(name: string, label: string): Promise<void> {
    runOnTransactionRollback(() => {
      this.events.push('default-rollback');
    });
    await this.members.save({ name });
    await this.recordStatWithHook(label); // commits independently on 'stats'
    throw new Error('default boom');
  }
}

describe('transaction hooks across two connections (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: CrossConnectionHookService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        NestjsTypeormModule.forRoot(PG_A),
        NestjsTypeormModule.forRoot({ ...PG_B, name: 'stats' }),
        NestjsTypeormModule.forFeature([Member]),
        NestjsTypeormModule.forFeature([Stat], 'stats'),
      ],
      providers: [CrossConnectionHookService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(CrossConnectionHookService);
  });

  beforeEach(async () => {
    await service.members.clear();
    await service.stats.clear();
    service.events = [];
  });
  afterAll(() => moduleRef.close());

  it("fires the named connection's commit hook and the default connection's rollback hook independently", async () => {
    await expect(service.writeMemberThenRecordStatThenFail('m1', 's1')).rejects.toThrow(
      'default boom',
    );

    // The stats transaction committed (and fired its hook) before the default rolled back.
    expect(service.events).toEqual(['stats-commit', 'default-rollback']);
    await expect(service.members.count()).resolves.toBe(0); // default connection rolled back
    await expect(service.stats.count()).resolves.toBe(1); // stats connection committed
  });
});
