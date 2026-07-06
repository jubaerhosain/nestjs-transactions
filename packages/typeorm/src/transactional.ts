import { Transactional as clsTransactional } from '@nestjs-transactions/core';
import type { Propagation } from '@nestjs-transactions/core';
import type { TypeOrmTransactionOptions } from '@nestjs-cls/transactional-adapter-typeorm';

/**
 * Options for {@link Transactional}. A single object — matching the ergonomics
 * of `typeorm-transactional` — carrying the connection, the propagation mode,
 * and the TypeORM transaction options (e.g. `isolationLevel`).
 */
export interface TransactionalOptions extends Partial<TypeOrmTransactionOptions> {
  /** The named connection to run on. Omit for the default connection. */
  connectionName?: string;
  /** The propagation mode. Defaults to `Propagation.REQUIRED`. */
  propagation?: Propagation;
}

/**
 * The underlying `@nestjs-cls` decorator, viewed positionally. We always pass
 * the options object (even when empty) as the third argument so its parser
 * takes the unambiguous three-argument branch — a connection named like a
 * propagation literal (e.g. `"REQUIRED"`) can never be misread as a propagation
 * mode. An empty object merges to the adapter defaults exactly as `undefined`
 * would, so behavior is unchanged.
 */
const delegate = clsTransactional as (
  connectionName: string | undefined,
  propagation: Propagation | undefined,
  options: TypeOrmTransactionOptions,
) => MethodDecorator;

/**
 * Run the decorated method in a transaction.
 *
 * Takes a single options object (unlike `@nestjs-cls`'s positional API), so
 * `connectionName` and `propagation` can never be confused and options read
 * clearly at the call site. Delegates to `@nestjs-cls/transactional` — the
 * transaction engine, propagation semantics, and NestJS method metadata are
 * all unchanged; no monkey-patching.
 *
 * @example
 * ```ts
 * @Transactional()
 * @Transactional({ propagation: Propagation.REQUIRES_NEW })
 * @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
 * @Transactional({ connectionName: 'stats', propagation: Propagation.NESTED })
 * ```
 */
export function Transactional(options: TransactionalOptions = {}): MethodDecorator {
  const { connectionName, propagation, ...adapterOptions } = options;
  return delegate(connectionName, propagation, adapterOptions as TypeOrmTransactionOptions);
}
