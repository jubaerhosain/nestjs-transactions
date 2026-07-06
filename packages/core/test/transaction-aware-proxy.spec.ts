import { createTransactionAwareProxy } from '../src/transaction-aware-proxy';

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
    const base = new Repo('base');
    let current = base;
    const proxy = createTransactionAwareProxy(() => current, base);

    expect(proxy.label).toBe('base');
    current = new Repo('tx');
    expect(proxy.label).toBe('tx');
  });

  it('binds methods to the currently resolved instance', () => {
    const base = new Repo('base');
    const tx = new Repo('tx');
    let current: Repo = base;
    const proxy = createTransactionAwareProxy(() => current, base);

    expect(proxy.save('a')).toBe('base:a');
    current = tx;
    expect(proxy.save('b')).toBe('tx:b');
    expect(base.rows).toEqual(['a']);
    expect(tx.rows).toEqual(['b']);
  });

  it('preserves instanceof and prototype checks', () => {
    const base = new Repo('base');
    const proxy = createTransactionAwareProxy(() => new Repo('tx'), base);

    expect(proxy instanceof Repo).toBe(true);
    expect(Object.getPrototypeOf(proxy)).toBe(Repo.prototype);
  });

  it('forwards property writes to the resolved instance', () => {
    const base = new Repo('base');
    const tx = new Repo('tx');
    const proxy = createTransactionAwareProxy(() => tx, base);

    proxy.label = 'changed';
    expect(tx.label).toBe('changed');
    expect(base.label).toBe('base');
  });

  it('reflects keys and `in` checks from the resolved instance', () => {
    const base = new Repo('base');
    const tx = new Repo('tx') as Repo & { extra?: number };
    tx.extra = 1;
    const proxy = createTransactionAwareProxy(() => tx, base) as Repo & { extra?: number };

    expect('extra' in proxy).toBe(true);
    expect(Object.keys(proxy)).toEqual(expect.arrayContaining(['label', 'rows', 'extra']));
    expect(proxy.extra).toBe(1);
  });

  it('evaluates resolve() once for the default base', () => {
    let calls = 0;
    const resolve = () => {
      calls++;
      return new Repo(`r${calls}`);
    };
    const proxy = createTransactionAwareProxy(resolve);
    expect(calls).toBe(1);
    expect(proxy.label).toBe('r2');
  });
});
