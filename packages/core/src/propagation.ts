import { Propagation as _Propagation } from '@nestjs-cls/transactional';

/**
 * Transaction propagation modes, exposed with SCREAMING_CASE members for a
 * uniform surface with adapter enums like `IsolationLevel`.
 *
 * Each member IS the underlying `@nestjs-cls/transactional` `Propagation` value,
 * so `Propagation.REQUIRES_NEW` is accepted anywhere the library expects a
 * propagation — the `@Transactional` decorator, `TransactionHost#withTransaction`,
 * etc. — with no casting.
 *
 * @example
 * ```ts
 * @Transactional(Propagation.REQUIRES_NEW)
 * async audit() { ... }
 * ```
 */
export const Propagation = {
  /** (default) Reuse the existing transaction or create a new one if none exists. */
  REQUIRED: _Propagation.Required,
  /** Always start an independent transaction, committed separately. */
  REQUIRES_NEW: _Propagation.RequiresNew,
  /** Run without a transaction even if one exists; resume it afterwards. */
  NOT_SUPPORTED: _Propagation.NotSupported,
  /** Reuse an existing transaction, throw if none is active. */
  MANDATORY: _Propagation.Mandatory,
  /** Run without a transaction, throw if one is already active. */
  NEVER: _Propagation.Never,
  /** Reuse the existing transaction, or run plainly if none exists. */
  SUPPORTS: _Propagation.Supports,
  /** Savepoint: an inner rollback doesn't kill the outer transaction. */
  NESTED: _Propagation.Nested,
} as const;

/** The propagation type — identical to `@nestjs-cls/transactional`'s `Propagation`. */
export type Propagation = _Propagation;
