import { Propagation, Transactional as clsTransactional } from '@nestjs-transactions/core';
import { Transactional } from '../../src/transactional';

// Mock ONLY the underlying decorator so we can inspect the exact positional
// arguments the object-form facade forwards. jest.spyOn would not work here: the
// facade binds `const delegate = clsTransactional` at import time, so we must
// replace the export before that module loads — which the hoisted jest.mock does.
jest.mock('@nestjs-transactions/core', () => ({
  ...jest.requireActual('@nestjs-transactions/core'),
  Transactional: jest.fn(() => () => undefined),
}));

const delegate = clsTransactional as unknown as jest.Mock;

describe('@Transactional facade — option → positional mapping', () => {
  beforeEach(() => delegate.mockClear());

  it('no arguments → (undefined, undefined, {})', () => {
    Transactional();
    expect(delegate).toHaveBeenCalledWith(undefined, undefined, {});
  });

  it('{ propagation } → (undefined, propagation, {})', () => {
    Transactional({ propagation: Propagation.REQUIRES_NEW });
    expect(delegate).toHaveBeenCalledWith(undefined, Propagation.REQUIRES_NEW, {});
  });

  it('{ connectionName } → (connectionName, undefined, {})', () => {
    Transactional({ connectionName: 'analytics' });
    expect(delegate).toHaveBeenCalledWith('analytics', undefined, {});
  });

  it("{ connectionName: 'default' } → normalizes to the default host (undefined)", () => {
    Transactional({ connectionName: 'default' });
    expect(delegate).toHaveBeenCalledWith(undefined, undefined, {});
  });

  it('forwards Prisma transaction options as the third argument', () => {
    Transactional({ isolationLevel: 'Serializable', timeout: 30_000, maxWait: 4_000 });
    expect(delegate).toHaveBeenCalledWith(undefined, undefined, {
      isolationLevel: 'Serializable',
      timeout: 30_000,
      maxWait: 4_000,
    });
  });

  it('combined → splits all three; tx options exclude connectionName/propagation', () => {
    Transactional({
      connectionName: 'analytics',
      propagation: Propagation.NESTED,
      isolationLevel: 'Serializable',
    });
    expect(delegate).toHaveBeenCalledWith('analytics', Propagation.NESTED, {
      isolationLevel: 'Serializable',
    });

    const [, , txOptions] = delegate.mock.calls[0];
    expect(txOptions).not.toHaveProperty('connectionName');
    expect(txOptions).not.toHaveProperty('propagation');
  });

  it('does not mutate the caller-supplied options object', () => {
    const options = {
      connectionName: 'analytics',
      propagation: Propagation.REQUIRES_NEW,
      timeout: 10_000,
    };
    const snapshot = { ...options };
    Transactional(options);
    expect(options).toEqual(snapshot);
  });
});
