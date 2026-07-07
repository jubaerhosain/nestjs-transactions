import { Logger } from '@nestjs/common';
import { TransactionalAdapter, TransactionHost } from '@nestjs-cls/transactional';
import { ClsServiceManager } from 'nestjs-cls';

/**
 * Transaction lifecycle hooks — a port of `typeorm-transactional`'s
 * `runOnTransactionCommit` / `runOnTransactionRollback` /
 * `runOnTransactionComplete`, built on CLS with no monkey-patching.
 *
 * Callbacks registered from inside a `@Transactional()` method are collected in
 * a per-transaction registry stored in the CLS context and fired when the
 * **physical** transaction settles: `wrapWithTransaction`'s promise resolves
 * only after COMMIT and rejects only after ROLLBACK (see
 * {@link applyTransactionHooks}).
 */

type CommitHook = () => void | Promise<void>;
type RollbackHook = (error: Error) => void | Promise<void>;
type CompleteHook = (error: Error | undefined) => void | Promise<void>;

interface HookRegistry {
  commit: CommitHook[];
  rollback: RollbackHook[];
  complete: CompleteHook[];
  /**
   * The connection whose transaction owns this registry. Used to confirm the
   * transaction is still active (not suspended by a `NOT_SUPPORTED`/`NEVER`
   * inner method) at the moment a hook is registered.
   */
  connectionName?: string;
}

const logger = new Logger('TransactionHooks');

/**
 * Single CLS key holding the **current** transaction's hook registry. Every
 * physical transaction runs in its own `cls.run({ ifNested: 'inherit' })` scope
 * (see `@nestjs-cls`'s `TransactionHost`), so setting this key installs a fresh
 * registry that shadows any inherited one — the innermost active transaction
 * always owns it, and `REQUIRES_NEW` stays isolated. A joined (`REQUIRED`) inner
 * method inherits the same registry object by reference and its hooks fire with
 * the outer transaction. This mirrors `typeorm-transactional`, whose hooks
 * attach to "the current transactional context" regardless of connection name.
 */
const HOOKS_KEY = Symbol.for('nestjs-transactions:hooks');

/**
 * Records the connection an adapter's `optionsFactory` was wrapped for, so
 * wrapping is idempotent per adapter instance and a mistaken re-wrap for a
 * different connection fails loudly instead of silently mis-wiring.
 */
const APPLIED = Symbol.for('nestjs-transactions:hooks-applied');

/**
 * Resolve the registry for the transaction the caller is currently inside.
 * Throws if there is no active transaction — including the case where an inner
 * `NOT_SUPPORTED`/`NEVER` method has suspended the transaction (CLS still
 * carries the inherited registry, but no transaction instance is active).
 */
function currentRegistry(): HookRegistry {
  const cls = ClsServiceManager.getClsService();
  const registry = cls.isActive() ? (cls.get(HOOKS_KEY) as HookRegistry | undefined) : undefined;
  if (!registry || !TransactionHost.getInstance(registry.connectionName).isTransactionActive()) {
    throw new Error(
      'No active transaction: transaction hooks (runOnTransactionCommit / ' +
        'runOnTransactionRollback / runOnTransactionComplete) must be called inside ' +
        'an active @Transactional() method (or TransactionHost#withTransaction).',
    );
  }
  return registry;
}

/**
 * Register a callback to run **after** the current transaction commits.
 *
 * Must be called inside an active `@Transactional()` method (or
 * `TransactionHost#withTransaction`), otherwise it throws. Attaches to the
 * innermost active transaction, whatever connection it uses.
 *
 * @param cb Callback fired after commit. May be async — it is awaited before
 *   the transactional method's promise resolves, and runs on the base
 *   (non-transactional) connection since the transaction has already committed.
 */
export function runOnTransactionCommit(cb: CommitHook): void {
  currentRegistry().commit.push(cb);
}

/**
 * Register a callback to run **after** the current transaction rolls back.
 *
 * Must be called inside an active `@Transactional()` method (or
 * `TransactionHost#withTransaction`), otherwise it throws.
 *
 * @param cb Callback fired after rollback, receiving the error that caused it.
 *   May be async — it is awaited before the transactional method rejects.
 */
export function runOnTransactionRollback(cb: RollbackHook): void {
  currentRegistry().rollback.push(cb);
}

/**
 * Register a callback to run **after** the current transaction settles, either
 * way. Receives the error on rollback, or `undefined` on commit.
 *
 * Must be called inside an active `@Transactional()` method (or
 * `TransactionHost#withTransaction`), otherwise it throws.
 *
 * @param cb Callback fired after the transaction completes. May be async — it
 *   is awaited before the transactional method settles.
 */
export function runOnTransactionComplete(cb: CompleteHook): void {
  currentRegistry().complete.push(cb);
}

/** Normalize a thrown/rejected value to an `Error` for the typed hook callbacks. */
function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Run a list of hooks sequentially, awaiting each. Iterates a snapshot so a hook
 * that (illegally) registers another hook can't grow the list mid-drain. A
 * throwing (or rejecting) hook is caught and logged — the transaction has
 * already settled, so a hook failure must not disrupt the caller or the rest.
 */
async function runHooks(
  hooks: ReadonlyArray<(arg: any) => void | Promise<void>>,
  arg: unknown,
): Promise<void> {
  for (const hook of [...hooks]) {
    try {
      await hook(arg);
    } catch (err) {
      // Nest's Logger.error treats the second argument as a stack STRING; an
      // Error object there would print as a raw extra message instead.
      const error = toError(err);
      logger.error(`A transaction hook threw and was ignored: ${error.message}`, error.stack);
    }
  }
}

/**
 * Wrap a transactional adapter so `@Transactional()` methods gain
 * commit/rollback/complete hooks, with no monkey-patching of the ORM.
 *
 * The adapter's `optionsFactory` is decorated so the transaction wrappers it
 * produces install a fresh hook registry in the CLS context (shadowing any
 * inherited one, so `REQUIRES_NEW` and `NESTED` stay isolated), run the
 * transaction, then fire the registered hooks:
 * - on resolve (COMMIT / savepoint release): `commit` then `complete(undefined)`
 * - on reject (ROLLBACK / savepoint rollback): `rollback(err)` then
 *   `complete(err)`, and re-throws the original error.
 *
 * For a top-level transaction the transaction instance is cleared before hooks
 * run (its query runner is already released after COMMIT/ROLLBACK), so hook
 * bodies that touch a repository resolve to the base connection — matching
 * `typeorm-transactional`. `wrapWithNestedTransaction` (savepoints) is wrapped
 * too, so a `NESTED` inner block's hooks fire on the savepoint's own outcome
 * rather than leaking onto the enclosing transaction.
 *
 * Idempotent per adapter instance; re-wrapping for a different connection throws.
 */
export function applyTransactionHooks(
  adapter: TransactionalAdapter<any, any, any>,
  connectionName?: string,
): void {
  const target = adapter as TransactionalAdapter<any, any, any> & {
    [APPLIED]?: string | null;
  };
  const marker = connectionName ?? null;
  if (target[APPLIED] !== undefined) {
    if (target[APPLIED] === marker) {
      return;
    }
    throw new Error(
      `applyTransactionHooks: adapter already wrapped for connection ` +
        `'${target[APPLIED] ?? '(default)'}'; cannot re-wrap for '${marker ?? '(default)'}'.`,
    );
  }
  target[APPLIED] = marker;

  const originalFactory = adapter.optionsFactory.bind(adapter);

  adapter.optionsFactory = (connection: any, extraProviders: any[]) => {
    const options = originalFactory(connection, extraProviders);

    const originalWrap = options.wrapWithTransaction.bind(options);
    options.wrapWithTransaction = (txOptions: any, fn: any, setTx: any) =>
      withHooks(connectionName, setTx, () => originalWrap(txOptions, fn, setTx));

    // Savepoints: give a NESTED block its own registry so its hooks fire on the
    // savepoint's outcome, not on the enclosing transaction's commit/rollback.
    if (typeof options.wrapWithNestedTransaction === 'function') {
      const originalNested = options.wrapWithNestedTransaction.bind(options);
      options.wrapWithNestedTransaction = (txOptions: any, fn: any, setTx: any, tx: any) =>
        // Do not clear the tx instance here: a savepoint shares the enclosing
        // transaction's (still-open) query runner, so it is not released.
        withHooks(connectionName, undefined, () => originalNested(txOptions, fn, setTx, tx));
    }

    return options;
  };
}

/**
 * Install a fresh hook registry for a physical transaction, run it, and fire the
 * hooks when it settles. When `clearTx` is provided it is called with
 * `undefined` after the transaction settles (before hooks run) so hook bodies
 * see the base connection rather than the released transactional one.
 */
async function withHooks(
  connectionName: string | undefined,
  clearTx: ((tx?: unknown) => void) | undefined,
  run: () => Promise<any>,
): Promise<any> {
  const cls = ClsServiceManager.getClsService();
  const registry: HookRegistry = { commit: [], rollback: [], complete: [], connectionName };
  cls.set(HOOKS_KEY, registry);

  let result: any;
  let caught: unknown;
  let committed = false;
  try {
    result = await run();
    committed = true;
  } catch (err) {
    caught = err;
  }

  clearTx?.(undefined);

  if (committed) {
    await runHooks(registry.commit, undefined);
    await runHooks(registry.complete, undefined);
    return result;
  }

  const error = toError(caught);
  await runHooks(registry.rollback, error);
  await runHooks(registry.complete, error);
  throw caught;
}
