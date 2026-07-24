import * as upstreamAdapter from '@nestjs-cls/transactional-adapter-prisma';
import * as core from '@nestjs-transactions/core';
import * as coreTesting from '@nestjs-transactions/core/testing';
import * as api from '../../src';
import * as testing from '../../src/testing';
import { IsolationLevel } from '../../src/isolation-level';
import {
  getPrismaClientToken,
  InjectPrismaClient,
  provideTransactionAwarePrismaClient,
} from '../../src/prisma-client.provider';
import { Transactional as FacadeTransactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';

/**
 * Executable form of the repo's "single symbol identity" convention: the
 * adapter re-exports core's symbols — never redefines them — with ONE
 * deliberate exception: `Transactional` is this package's object-form facade
 * wrapping core's decorator (same pattern as the typeorm adapter).
 */
describe('public surface — single symbol identity', () => {
  const coreReExports = [
    'InjectTransaction',
    'InjectTransactionHost',
    'Propagation',
    'TransactionAlreadyActiveError',
    'TransactionHost',
    'TransactionNotActiveError',
    'TransactionPropagationError',
    'getTransactionHostToken',
    'getTransactionToken',
    'runOnTransactionCommit',
    'runOnTransactionComplete',
    'runOnTransactionRollback',
  ] as const;

  it.each(coreReExports)('%s is core’s own symbol', (name) => {
    expect(api[name]).toBeDefined();
    expect(api[name]).toBe(core[name]);
  });

  it('Transactional is the object-form facade — deliberately NOT core’s decorator', () => {
    expect(api.Transactional).toBe(FacadeTransactional);
    expect(api.Transactional).not.toBe(core.Transactional);
  });

  it('exports the upstream adapter under both names with one identity', () => {
    expect(api.TransactionalAdapterPrisma).toBe(upstreamAdapter.TransactionalAdapterPrisma);
    expect(api.PrismaAdapter).toBe(upstreamAdapter.TransactionalAdapterPrisma);
  });

  it('exports the Prisma-specific extras', () => {
    expect(api.IsolationLevel).toBe(IsolationLevel);
    expect(api.TransactionalModule).toBe(TransactionalModule);
    expect(api.getPrismaClientToken).toBe(getPrismaClientToken);
    expect(api.InjectPrismaClient).toBe(InjectPrismaClient);
    expect(api.provideTransactionAwarePrismaClient).toBe(provideTransactionAwarePrismaClient);
  });

  it("testing barrel re-exports core's testing helpers with the same identity", () => {
    expect(testing.createNoOpTransactionalModule).toBe(coreTesting.createNoOpTransactionalModule);
    expect(testing.NoOpTransactionalAdapter).toBe(coreTesting.NoOpTransactionalAdapter);
    expect(typeof testing.createNoOpPrismaTransactionalModule).toBe('function');
  });
});
