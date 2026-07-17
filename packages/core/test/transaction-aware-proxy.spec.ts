import { createTransactionAwareProxy, TRANSACTION_AWARE } from '../src/transaction-aware-proxy';

class Repo {
  constructor(
    public label: string,
    public rows: string[] = [],
  ) {}

  save(row: string): string {
    this.rows.push(row);
    return `${this.label}:${row}`;
  }
}

describe('createTransactionAwareProxy', () => {
  it('re-resolves the target on every access', () => {
    let current = new Repo('base');
    const proxy = createTransactionAwareProxy(() => current);

    expect(proxy.label).toBe('base');
    current = new Repo('tx');
    expect(proxy.label).toBe('tx');
  });

  it('binds methods to the currently resolved instance', () => {
    const base = new Repo('base');
    const tx = new Repo('tx');
    let current: Repo = base;
    const proxy = createTransactionAwareProxy(() => current);

    expect(proxy.save('a')).toBe('base:a');
    current = tx;
    expect(proxy.save('b')).toBe('tx:b');
    expect(base.rows).toEqual(['a']);
    expect(tx.rows).toEqual(['b']);
  });

  it('is lazy: resolve is not called until first access', () => {
    const resolve = jest.fn(() => new Repo('r'));
    const proxy = createTransactionAwareProxy(resolve);
    expect(resolve).not.toHaveBeenCalled();
    void proxy.label;
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('throws a descriptive error when resolve returns undefined', () => {
    const proxy = createTransactionAwareProxy<Repo>(() => undefined as unknown as Repo);
    expect(() => proxy.label).toThrow(/could not resolve its target/);
  });

  describe('TRANSACTION_AWARE marker', () => {
    it('reads true WITHOUT resolving the target', () => {
      const resolve = jest.fn(() => new Repo('r'));
      const proxy = createTransactionAwareProxy(resolve);

      expect((proxy as unknown as Record<symbol, unknown>)[TRANSACTION_AWARE]).toBe(true);
      expect(TRANSACTION_AWARE in proxy).toBe(true);
      expect(resolve).not.toHaveBeenCalled();
    });

    it('reads true even when resolve would throw', () => {
      const proxy = createTransactionAwareProxy<Repo>(() => {
        throw new Error('no connection yet');
      });
      expect((proxy as unknown as Record<symbol, unknown>)[TRANSACTION_AWARE]).toBe(true);
    });

    it('is absent from plain objects and not enumerated on the proxy', () => {
      const plain = new Repo('r');
      expect((plain as unknown as Record<symbol, unknown>)[TRANSACTION_AWARE]).toBeUndefined();

      const proxy = createTransactionAwareProxy(() => plain);
      expect(Reflect.ownKeys(proxy)).not.toContain(TRANSACTION_AWARE);
    });
  });

  it('keeps method identity stable while the resolved instance is unchanged', () => {
    const repo = new Repo('r');
    const proxy = createTransactionAwareProxy(() => repo);
    expect(proxy.save).toBe(proxy.save);

    const other = new Repo('o');
    const proxyOther = createTransactionAwareProxy(() => other);
    expect(proxyOther.save).not.toBe(proxy.save);
  });

  it('preserves instanceof and prototype checks', () => {
    const proxy = createTransactionAwareProxy(() => new Repo('tx'));
    expect(proxy instanceof Repo).toBe(true);
    expect(Object.getPrototypeOf(proxy)).toBe(Repo.prototype);
  });

  describe('overrides overlay (spies and writes)', () => {
    it('keeps assigned values visible across re-resolutions', () => {
      const a = new Repo('a');
      const b = new Repo('b');
      let current = a;
      const proxy = createTransactionAwareProxy(() => current);

      proxy.label = 'patched';
      expect(proxy.label).toBe('patched');
      current = b;
      expect(proxy.label).toBe('patched'); // shadow survives a target switch
      expect(a.label).toBe('a'); // underlying instances untouched
      expect(b.label).toBe('b');
    });

    it('keeps jest.spyOn mocks visible even when the resolved instance changes', () => {
      const outside = new Repo('outside');
      const insideTx = new Repo('tx');
      let current = outside;
      const proxy = createTransactionAwareProxy(() => current);

      const spy = jest.spyOn(proxy, 'save').mockReturnValue('mocked');
      expect(proxy.save('x')).toBe('mocked');

      current = insideTx; // simulates entering @Transactional()
      expect(proxy.save('y')).toBe('mocked');
      expect(spy).toHaveBeenCalledTimes(2);
      expect(insideTx.rows).toEqual([]); // real save never ran

      spy.mockRestore();
      expect(proxy.save('z')).toBe('tx:z'); // live resolution restored
      expect(insideTx.rows).toEqual(['z']);
    });

    it('delete restores live resolution', () => {
      const repo = new Repo('r');
      const proxy = createTransactionAwareProxy(() => repo) as Repo & Record<string, unknown>;

      proxy.label = 'shadow';
      expect(proxy.label).toBe('shadow');
      delete (proxy as Record<string, unknown>).label;
      expect(proxy.label).toBe('r');
    });

    it('has and ownKeys include overridden properties', () => {
      const repo = new Repo('r');
      const proxy = createTransactionAwareProxy(() => repo) as Repo & { extra?: number };

      proxy.extra = 1;
      expect('extra' in proxy).toBe(true);
      expect(Object.keys(proxy)).toEqual(expect.arrayContaining(['label', 'rows', 'extra']));
      expect('label' in proxy).toBe(true);
    });

    it('honors an accessor (getter) installed via defineProperty', () => {
      const repo = new Repo('r');
      const proxy = createTransactionAwareProxy(() => repo) as Repo & { computed: string };

      let calls = 0;
      Object.defineProperty(proxy, 'computed', {
        get() {
          calls += 1;
          return `computed-${calls}`;
        },
        configurable: true,
      });

      expect(proxy.computed).toBe('computed-1');
      expect(proxy.computed).toBe('computed-2'); // getter runs on each access
    });
  });

  describe('edge cases', () => {
    it('is not thenable when the resolved target has no then', () => {
      const proxy = createTransactionAwareProxy<Record<string, unknown>>(() => ({ a: 1 }));
      expect((proxy as { then?: unknown }).then).toBeUndefined();
    });

    it('resolves to the proxy itself when awaited (non-thenable target)', async () => {
      const proxy = createTransactionAwareProxy<Record<string, unknown>>(() => ({ a: 1 }));
      await expect(Promise.resolve(proxy)).resolves.toBe(proxy);
    });

    it('reflects symbol-keyed properties from the resolved target', () => {
      const tag = Symbol('tag');
      const target = { [tag]: 'symbol-value' };
      const proxy = createTransactionAwareProxy<Record<string | symbol, unknown>>(() => target);
      expect(proxy[tag]).toBe('symbol-value');
    });

    it('names null in the descriptive error when resolve returns null', () => {
      const proxy = createTransactionAwareProxy<Repo>(() => null as unknown as Repo);
      expect(() => proxy.label).toThrow(/returned null/);
    });
  });
});
