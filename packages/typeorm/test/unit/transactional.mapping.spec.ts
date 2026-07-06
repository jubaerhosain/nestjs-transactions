import { Propagation, Transactional as clsTransactional } from '@nestjs-transactions/core';
import { IsolationLevel } from '../../src/isolation-level';
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
    Transactional({ connectionName: 'stats' });
    expect(delegate).toHaveBeenCalledWith('stats', undefined, {});
  });

  it('{ isolationLevel } → forwards adapter options as the third argument', () => {
    Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE });
    expect(delegate).toHaveBeenCalledWith(undefined, undefined, {
      isolationLevel: IsolationLevel.SERIALIZABLE,
    });
  });

  it('combined → splits all three; adapter options exclude connectionName/propagation', () => {
    Transactional({
      connectionName: 'stats',
      propagation: Propagation.NESTED,
      isolationLevel: IsolationLevel.SERIALIZABLE,
    });
    expect(delegate).toHaveBeenCalledWith('stats', Propagation.NESTED, {
      isolationLevel: IsolationLevel.SERIALIZABLE,
    });

    const [, , adapterOptions] = delegate.mock.calls[0];
    expect(adapterOptions).not.toHaveProperty('connectionName');
    expect(adapterOptions).not.toHaveProperty('propagation');
  });

  it('does not mutate the caller-supplied options object', () => {
    const options = {
      connectionName: 'stats',
      propagation: Propagation.REQUIRES_NEW,
      isolationLevel: IsolationLevel.SERIALIZABLE,
    };
    const snapshot = { ...options };
    Transactional(options);
    expect(options).toEqual(snapshot);
  });
});
