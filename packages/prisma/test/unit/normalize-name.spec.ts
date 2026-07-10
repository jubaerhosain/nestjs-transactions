import { normalizeName } from '../../src/normalize-name';

describe('normalizeName', () => {
  it('passes undefined through unchanged (the default connection)', () => {
    expect(normalizeName(undefined)).toBeUndefined();
  });

  it("maps the literal 'default' to undefined", () => {
    expect(normalizeName('default')).toBeUndefined();
  });

  it('returns a real connection name unchanged', () => {
    expect(normalizeName('analytics')).toBe('analytics');
  });

  // The empty string is falsy, so it collapses to the default connection —
  // matching upstream `@nestjs-cls`, which resolves connection tokens by
  // truthiness (an empty name would otherwise key a client token that no
  // TransactionHost is registered under).
  it('treats the empty string as the default connection (matches upstream truthiness)', () => {
    expect(normalizeName('')).toBeUndefined();
  });

  // The match on 'default' is exact and case-sensitive, so these stay distinct.
  it('is case-sensitive: "Default"/"DEFAULT" are distinct named connections', () => {
    expect(normalizeName('Default')).toBe('Default');
    expect(normalizeName('DEFAULT')).toBe('DEFAULT');
  });
});
