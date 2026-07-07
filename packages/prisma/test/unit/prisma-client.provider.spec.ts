import { FactoryProvider } from '@nestjs/common';
import { getTransactionHostToken } from '@nestjs-transactions/core';
import {
  getPrismaClientToken,
  provideTransactionAwarePrismaClient,
} from '../../src/prisma-client.provider';

describe('getPrismaClientToken', () => {
  it('returns the default token for no connection name', () => {
    expect(getPrismaClientToken()).toBe('TRANSACTIONAL_PRISMA_CLIENT');
  });

  it("treats the literal 'default' as the default connection", () => {
    expect(getPrismaClientToken('default')).toBe(getPrismaClientToken());
  });

  it('returns a distinct token per named connection', () => {
    expect(getPrismaClientToken('analytics')).toBe('TRANSACTIONAL_PRISMA_CLIENT_analytics');
    expect(getPrismaClientToken('analytics')).not.toBe(getPrismaClientToken());
  });
});

describe('provideTransactionAwarePrismaClient', () => {
  function buildProxy(txHost: { tx: any }) {
    const provider = provideTransactionAwarePrismaClient() as FactoryProvider;
    return provider.useFactory(txHost);
  }

  it('registers under the client token and injects the matching TransactionHost', () => {
    const provider = provideTransactionAwarePrismaClient('analytics') as FactoryProvider;
    expect(provider.provide).toBe(getPrismaClientToken('analytics'));
    expect(provider.inject).toEqual([getTransactionHostToken('analytics')]);
  });

  it('delegates property access to the current txHost.tx', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const proxy = buildProxy({ tx: { author: { create } } });

    await expect(proxy.author.create({ data: { name: 'a' } })).resolves.toEqual({ id: 1 });
    expect(create).toHaveBeenCalledWith({ data: { name: 'a' } });
  });

  it('re-resolves on every access, so a transaction switch is picked up', () => {
    const base = { marker: 'base' };
    const tx = { marker: 'tx' };
    const txHost = { tx: base as any };
    const proxy = buildProxy(txHost);

    expect(proxy.marker).toBe('base');
    txHost.tx = tx;
    expect(proxy.marker).toBe('tx');
  });
});
