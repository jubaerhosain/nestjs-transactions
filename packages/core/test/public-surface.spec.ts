import * as upstream from '@nestjs-cls/transactional';
import * as api from '../src';
import * as testing from '../src/testing';
import { createTransactionalModule } from '../src/create-transactional-module';
import { Propagation } from '../src/propagation';
import { createTransactionAwareProxy } from '../src/transaction-aware-proxy';
import {
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
} from '../src/transaction-hooks';

/**
 * Executable form of the repo's "single symbol identity" convention: core
 * re-exports the canonical decorators, tokens, and error classes from
 * `@nestjs-cls/transactional` — never redefines them — so `@Transactional`,
 * `TransactionHost`, etc. share one identity across every package.
 */
describe('public surface — single symbol identity', () => {
  const upstreamReExports = [
    'ClsPluginTransactional',
    'InjectTransaction',
    'InjectTransactionHost',
    'Transactional',
    'TransactionAlreadyActiveError',
    'TransactionHost',
    'TransactionNotActiveError',
    'TransactionPropagationError',
    'getTransactionHostToken',
    'getTransactionToken',
  ] as const;

  it.each(upstreamReExports)('%s is @nestjs-cls/transactional’s own symbol', (name) => {
    expect(api[name]).toBeDefined();
    expect(api[name]).toBe(upstream[name]);
  });

  it('exports the local SPI, propagation surface, and lifecycle hooks', () => {
    expect(api.Propagation).toBe(Propagation);
    expect(api.createTransactionalModule).toBe(createTransactionalModule);
    expect(api.createTransactionAwareProxy).toBe(createTransactionAwareProxy);
    expect(api.runOnTransactionCommit).toBe(runOnTransactionCommit);
    expect(api.runOnTransactionComplete).toBe(runOnTransactionComplete);
    expect(api.runOnTransactionRollback).toBe(runOnTransactionRollback);
  });

  it('testing barrel re-exports NoOpTransactionalAdapter with upstream identity', () => {
    expect(testing.NoOpTransactionalAdapter).toBe(upstream.NoOpTransactionalAdapter);
    expect(typeof testing.createNoOpTransactionalModule).toBe('function');
  });
});
