import { Transactional as clsTransactional } from '@nestjs-transactions/core';
import type { Propagation } from '@nestjs-transactions/core';
import { normalizeName, PrismaTxOptions } from './interfaces';

/**
 * Options for {@link Transactional}. A single object carrying the connection,
 * the propagation mode, and Prisma's native transaction options (`maxWait`,
 * `timeout`, `isolationLevel`). Prisma's default `timeout` is 5 seconds —
 * raise it here for long-running transactions.
 */
export type TransactionalOptions = PrismaTxOptions & {
  /** The named connection to run on. Omit for the default connection. */
  connectionName?: string;
  /** The propagation mode. Defaults to `Propagation.REQUIRED`. */
  propagation?: Propagation;
};

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
  options: PrismaTxOptions,
) => MethodDecorator;

/**
 * Run the decorated method in a Prisma interactive transaction.
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
 * @Transactional({ isolationLevel: 'Serializable', timeout: 30_000 })
 * @Transactional({ connectionName: 'analytics', propagation: Propagation.NESTED })
 * ```
 */
export function Transactional(options: TransactionalOptions = {}): MethodDecorator {
  const { connectionName, propagation, ...txOptions } = options;
  // The literal 'default' names the default connection — whose TransactionHost
  // is registered under `undefined`, not a `TransactionHost_default` symbol —
  // so it must go through the same normalization as the module options.
  return delegate(normalizeName(connectionName), propagation, txOptions as PrismaTxOptions);
}
