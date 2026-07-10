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

  it('throws a descriptive error when the current client resolves to undefined', () => {
    const proxy = buildProxy({ tx: undefined });
    expect(() => proxy.marker).toThrow(TypeError);
    expect(() => proxy.marker).toThrow(/resolve|undefined/i);
  });

  it('keeps method identity stable per client instance and re-binds on switch', () => {
    const base = { $queryRaw: jest.fn() };
    const tx = { $queryRaw: jest.fn() };
    const txHost = { tx: base as any };
    const proxy = buildProxy(txHost);

    expect(proxy.$queryRaw).toBe(proxy.$queryRaw);
    const boundToBase = proxy.$queryRaw;

    txHost.tx = tx;
    expect(proxy.$queryRaw).toBe(proxy.$queryRaw);
    expect(proxy.$queryRaw).not.toBe(boundToBase);

    proxy.$queryRaw('q');
    expect(tx.$queryRaw).toHaveBeenCalledWith('q');
    expect(base.$queryRaw).not.toHaveBeenCalled();
  });

  it('a jest.spyOn override survives a transaction-client switch and restores cleanly', async () => {
    const base = { author: 'base-author' };
    const tx = { author: 'tx-author' };
    const txHost = { tx: base as any };
    const proxy = buildProxy(txHost);

    Object.defineProperty(proxy, 'author', { value: 'mocked', configurable: true });
    expect(proxy.author).toBe('mocked');

    txHost.tx = tx;
    // The override overlay wins regardless of which client is current…
    expect(proxy.author).toBe('mocked');

    // …and deleting it restores live resolution against the current client.
    delete (proxy as any).author;
    expect(proxy.author).toBe('tx-author');
  });

  it('is not accidentally thenable when the resolved client has no then', () => {
    // A PrismaClient has no `then`; awaiting the injected proxy must not stall or
    // misbehave. The proxy delegates `.then` to the target, which is undefined.
    const proxy = buildProxy({ tx: { author: {} } as any });
    expect((proxy as any).then).toBeUndefined();
  });

  it('resolves to the proxy itself when awaited (non-thenable target)', async () => {
    const client = { marker: 'tx' };
    const proxy = buildProxy({ tx: client as any });
    await expect(Promise.resolve(proxy)).resolves.toBe(proxy);
  });

  it('propagates a rejection thrown by the delegate method', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db fail'));
    const proxy = buildProxy({ tx: { author: { create } } });

    await expect(proxy.author.create({ data: {} })).rejects.toThrow('db fail');
  });

  it('returns undefined for a property absent on the resolved client', () => {
    const proxy = buildProxy({ tx: { author: {} } as any });
    expect(proxy.doesNotExist).toBeUndefined();
  });
});
