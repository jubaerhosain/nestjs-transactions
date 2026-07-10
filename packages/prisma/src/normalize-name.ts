const DEFAULT_CONNECTION_NAME = 'default';

/**
 * Map the literal 'default' name — or any falsy value (`''` / `undefined`) — to
 * `undefined` (the default connection), matching how `@nestjs-cls` resolves
 * connection tokens (`getTransactionClsKey` / `getTransactionHostToken` treat
 * the name by truthiness). Keeps our token derivation consistent with the
 * TransactionHost / CLS keys the plugin registers. `'Default'` / `'DEFAULT'`
 * stay distinct — the match on `'default'` is exact and case-sensitive.
 */
export function normalizeName(name: string | undefined): string | undefined {
  return !name || name === DEFAULT_CONNECTION_NAME ? undefined : name;
}
