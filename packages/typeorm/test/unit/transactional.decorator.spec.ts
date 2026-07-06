import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createNoOpTransactionalModule } from '@nestjs-transactions/core/testing';
import { Propagation, Transactional, TransactionNotActiveError } from '../../src';

describe('@Transactional (object-form facade)', () => {
  it('maps { propagation }: MANDATORY throws when no transaction is active', async () => {
    @Injectable()
    class Svc {
      @Transactional({ propagation: Propagation.MANDATORY })
      async run(): Promise<void> {}
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule()],
      providers: [Svc],
    }).compile();

    // The propagation guard throws synchronously from the decorator proxy, so
    // wrap the call to normalize it into a rejection.
    await expect(async () => moduleRef.get(Svc).run()).rejects.toBeInstanceOf(
      TransactionNotActiveError,
    );
    await moduleRef.close();
  });

  it('maps { propagation }: NEVER runs when no transaction is active', async () => {
    @Injectable()
    class Svc {
      @Transactional({ propagation: Propagation.NEVER })
      async run(): Promise<string> {
        return 'ok';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule()],
      providers: [Svc],
    }).compile();

    await expect(moduleRef.get(Svc).run()).resolves.toBe('ok');
    await moduleRef.close();
  });

  it("maps { connectionName: 'default' } to the default host", async () => {
    // Only the DEFAULT connection is registered (no named 'default' host). If the
    // facade forwarded 'default' raw, it would resolve TransactionHost_default —
    // which was never registered — and throw. Running to completion proves
    // 'default' is normalized to the default connection, matching resolveConnection.
    @Injectable()
    class Svc {
      @Transactional({ connectionName: 'default' })
      async run(): Promise<string> {
        return 'ok';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule()],
      providers: [Svc],
    }).compile();

    await expect(moduleRef.get(Svc).run()).resolves.toBe('ok');
    await moduleRef.close();
  });

  it('maps { connectionName } even when the name collides with a propagation literal', async () => {
    // Only the connection literally named "REQUIRED" is registered — the default
    // connection is NOT. If the facade misread "REQUIRED" as a propagation mode
    // (the ambiguity in @nestjs-cls's positional API), it would resolve the
    // default TransactionHost and throw. Running to completion proves the object
    // form routes to the named connection unambiguously.
    @Injectable()
    class Svc {
      @Transactional({ connectionName: 'REQUIRED' })
      async run(): Promise<string> {
        return 'ok';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule({ connectionName: 'REQUIRED' })],
      providers: [Svc],
    }).compile();

    await expect(moduleRef.get(Svc).run()).resolves.toBe('ok');
    await moduleRef.close();
  });
});
