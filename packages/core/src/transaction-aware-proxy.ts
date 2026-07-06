/**
 * Wrap an object in a Proxy that re-resolves its target on every property
 * access. Combined with `TransactionHost#tx` — which returns the transactional
 * client inside a transaction and the regular one outside — this is what makes
 * an injected repository/client silently transaction-aware.
 *
 * @param resolve Called on every access; must return the instance to delegate to
 *                (e.g. `() => txHost.tx.getRepository(Entity)`).
 * @param base    The proxy target. Pass the real (non-transactional) instance so
 *                `instanceof`, `Object.keys` and prototype checks behave like the
 *                real thing. Defaults to `resolve()` evaluated once.
 */
export function createTransactionAwareProxy<T extends object>(resolve: () => T, base?: T): T {
  const target = base ?? resolve();
  return new Proxy(target, {
    get(_target, prop) {
      const current = resolve();
      const value = Reflect.get(current, prop, current);
      return typeof value === 'function' ? value.bind(current) : value;
    },
    set(_target, prop, value) {
      return Reflect.set(resolve(), prop, value);
    },
    has(_target, prop) {
      return prop in resolve();
    },
    ownKeys() {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, prop) {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      if (descriptor) {
        // The descriptor comes from a different object than the proxy target;
        // it must be reported configurable to satisfy proxy invariants.
        descriptor.configurable = true;
      }
      return descriptor;
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}
