import { Logger } from '@nestjs/common';

const DEFAULT_KEY = Symbol('default-transactional-connection');

/**
 * Process-wide record of registered transactional connections. Adapters call
 * `register()` from `forRoot()` so duplicate registrations of the same
 * connection name surface as a warning instead of a silent misconfiguration.
 */
export class ConnectionRegistry {
  private static readonly connections = new Map<string | symbol, string>();
  private static readonly logger = new Logger('TransactionalModule');

  static register(connectionName: string | undefined, description: string): void {
    const key = connectionName ?? DEFAULT_KEY;
    if (this.connections.has(key)) {
      this.logger.warn(
        `The transactional connection ${
          connectionName ? `"${connectionName}"` : '(default)'
        } is registered more than once (${this.connections.get(key)} and ${description}). ` +
          'Each connection should be registered by exactly one TransactionalModule.forRoot() call.',
      );
    }
    this.connections.set(key, description);
  }

  static has(connectionName?: string): boolean {
    return this.connections.has(connectionName ?? DEFAULT_KEY);
  }

  /** Clear all registrations. Intended for test suites that boot multiple apps. */
  static reset(): void {
    this.connections.clear();
  }
}
