import { Logger } from '@nestjs/common';
import { ConnectionRegistry } from '../src/connection-registry';

describe('ConnectionRegistry', () => {
  beforeEach(() => ConnectionRegistry.reset());

  it('records registrations for default and named connections', () => {
    ConnectionRegistry.register(undefined, 'ModuleA');
    ConnectionRegistry.register('stats', 'ModuleA');

    expect(ConnectionRegistry.has()).toBe(true);
    expect(ConnectionRegistry.has('stats')).toBe(true);
    expect(ConnectionRegistry.has('other')).toBe(false);
  });

  it('warns when the same connection is registered twice', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    ConnectionRegistry.register('stats', 'ModuleA');
    ConnectionRegistry.register('stats', 'ModuleB');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"stats"'));
    warn.mockRestore();
  });

  it('reset() clears all registrations', () => {
    ConnectionRegistry.register('stats', 'ModuleA');
    ConnectionRegistry.reset();
    expect(ConnectionRegistry.has('stats')).toBe(false);
  });
});
