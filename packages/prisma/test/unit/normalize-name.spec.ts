import { normalizeName } from '../../src/interfaces';

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

  // Documented edges: normalization is an exact, case-sensitive match on
  // 'default', so these are deliberately NOT collapsed to the default connection.
  it('does not treat the empty string as the default connection', () => {
    expect(normalizeName('')).toBe('');
  });

  it('is case-sensitive: "Default"/"DEFAULT" are distinct named connections', () => {
    expect(normalizeName('Default')).toBe('Default');
    expect(normalizeName('DEFAULT')).toBe('DEFAULT');
  });
});
