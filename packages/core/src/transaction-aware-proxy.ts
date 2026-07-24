/**
 * Wrap an object in a Proxy that re-resolves its target on every property
 * access. Combined with `TransactionHost#tx` — which returns the transactional
 * client inside a transaction and the regular one outside — this is what makes
 * an injected repository/client silently transaction-aware.
 *
 * Semantics:
 * - **Lazy**: `resolve` is not called until the first property access, so
 *   constructing the proxy never fails.
 * - **Patchable**: property writes, `defineProperty` (e.g. `jest.spyOn`) and
 *   `delete` operate on an internal overlay that shadows the resolved
 *   instance, so test doubles installed on the proxy stay visible inside AND
 *   outside transactions; deleting the property restores live resolution
 *   (which is exactly what jest's `mockRestore()` does for prototype methods).
 * - **Stable methods**: bound methods are memoized per resolved instance, so
 *   `proxy.method === proxy.method` while the same instance is current.
 *
 * @param resolve Called on access; must return the instance to delegate to
 *                (e.g. `() => txHost.tx.getRepository(Entity)`).
 */
export function createTransactionAwareProxy<T extends object>(resolve: () => T): T {
  const overrides = new Map<string | symbol, PropertyDescriptor>();
  const boundMethods = new WeakMap<object, Map<string | symbol, unknown>>();

  const resolveOrThrow = (): T => {
    const current = resolve();
    if (current === null || current === undefined) {
      throw new TypeError(
        'Transaction-aware proxy could not resolve its target (resolve() returned ' +
          `${current}). If you are using a mocked manager, make sure it returns a value ` +
          'for every registered entity/client.',
      );
    }
    return current;
  };

  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const override = overrides.get(prop);
      if (override) {
        return 'get' in override || 'set' in override
          ? override.get?.call(receiver)
          : override.value;
      }
      const current = resolveOrThrow();
      const value = Reflect.get(current, prop, current);
      if (typeof value !== 'function') {
        return value;
      }
      let methods = boundMethods.get(current);
      if (!methods) {
        methods = new Map();
        boundMethods.set(current, methods);
      }
      let bound = methods.get(prop);
      if (bound === undefined) {
        bound = value.bind(current);
        methods.set(prop, bound);
      }
      return bound;
    },
    set(_target, prop, value) {
      overrides.set(prop, { value, writable: true, enumerable: true, configurable: true });
      return true;
    },
    defineProperty(_target, prop, descriptor) {
      overrides.set(prop, descriptor);
      return true;
    },
    deleteProperty(_target, prop) {
      overrides.delete(prop);
      return true;
    },
    has(_target, prop) {
      return overrides.has(prop) || prop in resolveOrThrow();
    },
    ownKeys() {
      return [...new Set([...Reflect.ownKeys(resolveOrThrow()), ...overrides.keys()])];
    },
    getOwnPropertyDescriptor(_target, prop) {
      const override = overrides.get(prop);
      const descriptor = override ?? Reflect.getOwnPropertyDescriptor(resolveOrThrow(), prop);
      if (descriptor) {
        // Descriptors come from a different object than the proxy target;
        // they must be reported configurable to satisfy proxy invariants.
        return { ...descriptor, configurable: true };
      }
      return undefined;
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(resolveOrThrow());
    },
  });
}
