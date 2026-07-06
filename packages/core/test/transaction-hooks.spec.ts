import { Injectable, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClsPluginTransactional, NoOpTransactionalAdapter } from '@nestjs-cls/transactional';
import { ClsModule } from 'nestjs-cls';
import { Transactional } from '../src';
import { runOnTransactionCommit, runOnTransactionComplete, runOnTransactionRollback } from '../src';
import { applyTransactionHooks } from '../src/transaction-hooks';
import { createNoOpTransactionalModule } from '../src/testing';

class BoomError extends Error {
  constructor() {
    super('boom');
    this.name = 'BoomError';
  }
}

@Injectable()
class Service {
  readonly events: string[] = [];
  completeArg: Error | undefined | 'unset' = 'unset';
  rollbackArg?: Error;

  @Transactional()
  async commitPath(): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('commit');
    });
    runOnTransactionRollback(() => {
      this.events.push('rollback');
    });
    runOnTransactionComplete((err) => {
      this.events.push('complete');
      this.completeArg = err;
    });
  }

  @Transactional()
  async rollbackPath(): Promise<void> {
    runOnTransactionCommit(() => {
      this.events.push('commit');
    });
    runOnTransactionRollback((err) => {
      this.events.push('rollback');
      this.rollbackArg = err;
    });
    runOnTransactionComplete((err) => {
      this.events.push('complete');
      this.completeArg = err;
    });
    throw new BoomError();
  }

  @Transactional()
  async asyncOrder(): Promise<void> {
    runOnTransactionCommit(async () => {
      await Promise.resolve();
      this.events.push('first');
    });
    runOnTransactionCommit(() => {
      this.events.push('second');
    });
  }

  @Transactional()
  async throwingHook(): Promise<void> {
    runOnTransactionCommit(() => {
      throw new Error('hook exploded');
    });
    runOnTransactionCommit(() => {
      this.events.push('after-throw');
    });
  }

  @Transactional()
  async rollbackWithNonError(): Promise<void> {
    runOnTransactionRollback((err) => {
      this.rollbackArg = err;
    });
    runOnTransactionComplete((err) => {
      this.completeArg = err;
    });
    throw 'plain string failure';
  }

  // Both settlement hooks throw: the swallowed hook errors must not mask the
  // original rejection, and complete must still run after a throwing rollback.
  @Transactional()
  async throwingSettlementHooks(): Promise<void> {
    runOnTransactionRollback((err) => {
      this.events.push('rollback');
      this.rollbackArg = err;
      throw new Error('rollback hook exploded');
    });
    runOnTransactionComplete((err) => {
      this.events.push('complete');
      this.completeArg = err;
      throw new Error('complete hook exploded');
    });
    throw new BoomError();
  }
}

async function bootstrap() {
  const moduleRef = await Test.createTestingModule({
    imports: [createNoOpTransactionalModule()],
    providers: [Service],
  }).compile();
  return { moduleRef, service: moduleRef.get(Service) };
}

describe('transaction hooks', () => {
  it('fires commit then complete(undefined) on success', async () => {
    const { moduleRef, service } = await bootstrap();

    await service.commitPath();

    expect(service.events).toEqual(['commit', 'complete']);
    expect(service.completeArg).toBeUndefined();
    await moduleRef.close();
  });

  it('fires rollback then complete(error) on failure and re-throws', async () => {
    const { moduleRef, service } = await bootstrap();

    await expect(service.rollbackPath()).rejects.toBeInstanceOf(BoomError);

    expect(service.events).toEqual(['rollback', 'complete']);
    expect(service.rollbackArg).toBeInstanceOf(BoomError);
    expect(service.completeArg).toBeInstanceOf(BoomError);
    await moduleRef.close();
  });

  it('does not fire commit hooks on rollback', async () => {
    const { moduleRef, service } = await bootstrap();

    await expect(service.rollbackPath()).rejects.toBeInstanceOf(BoomError);

    expect(service.events).not.toContain('commit');
    await moduleRef.close();
  });

  it('awaits async hooks sequentially in registration order', async () => {
    const { moduleRef, service } = await bootstrap();

    await service.asyncOrder();

    expect(service.events).toEqual(['first', 'second']);
    await moduleRef.close();
  });

  it('swallows and logs a throwing hook, still running the rest', async () => {
    const { moduleRef, service } = await bootstrap();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(service.throwingHook()).resolves.toBeUndefined();

    expect(service.events).toEqual(['after-throw']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    await moduleRef.close();
  });

  it('normalizes a non-Error rejection to an Error before passing it to hooks', async () => {
    const { moduleRef, service } = await bootstrap();

    await expect(service.rollbackWithNonError()).rejects.toBe('plain string failure');

    expect(service.rollbackArg).toBeInstanceOf(Error);
    expect((service.rollbackArg as Error).message).toBe('plain string failure');
    expect(service.completeArg).toBeInstanceOf(Error);
    await moduleRef.close();
  });

  it('re-throws the original error when a rollback/complete hook throws, still running complete', async () => {
    const { moduleRef, service } = await bootstrap();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // The hook errors are swallowed; the original BoomError still propagates.
    await expect(service.throwingSettlementHooks()).rejects.toBeInstanceOf(BoomError);

    expect(service.events).toEqual(['rollback', 'complete']);
    expect(service.rollbackArg).toBeInstanceOf(BoomError);
    expect(service.completeArg).toBeInstanceOf(BoomError);
    expect(errorSpy).toHaveBeenCalledTimes(2); // both hooks threw and were logged
    errorSpy.mockRestore();
    await moduleRef.close();
  });

  it('fires each hook exactly once per transaction across sequential calls', async () => {
    const { moduleRef, service } = await bootstrap();

    await service.commitPath();
    await service.commitPath();

    // A fresh registry per transaction: no accumulation/re-firing from the first call.
    expect(service.events).toEqual(['commit', 'complete', 'commit', 'complete']);
    await moduleRef.close();
  });

  it('throws when registered outside an active transaction', () => {
    expect(() => runOnTransactionCommit(() => undefined)).toThrow(/No active transaction/);
    expect(() => runOnTransactionRollback(() => undefined)).toThrow(/No active transaction/);
    expect(() => runOnTransactionComplete(() => undefined)).toThrow(/No active transaction/);
  });

  describe('applyTransactionHooks idempotency', () => {
    it('is a no-op when re-applied for the same connection (hooks fire once)', async () => {
      const adapter = new NoOpTransactionalAdapter({ tx: {}, disableWarning: true });
      applyTransactionHooks(adapter);
      applyTransactionHooks(adapter); // second application must not double-wrap

      const moduleRef = await Test.createTestingModule({
        imports: [ClsModule.registerPlugins([new ClsPluginTransactional({ adapter })])],
        providers: [Service],
      }).compile();
      const service = moduleRef.get(Service);

      await service.commitPath();

      expect(service.events).toEqual(['commit', 'complete']);
      await moduleRef.close();
    });

    it('throws when re-applied for a different connection', () => {
      const adapter = new NoOpTransactionalAdapter({ tx: {}, disableWarning: true });
      applyTransactionHooks(adapter, 'a');
      expect(() => applyTransactionHooks(adapter, 'b')).toThrow(/already wrapped for connection/);
    });
  });
});
