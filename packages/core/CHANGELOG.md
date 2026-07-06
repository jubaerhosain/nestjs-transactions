# @nestjs-transactions/core

## 0.2.0

### Minor Changes

- [`bb2ea1d`](https://github.com/jubaerhosain/nestjs-transactions/commit/bb2ea1d89cfed07485060c0c2257c886ddabe922) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Fix all 10 findings from the initial code review.

  **Behavior changes:**

  - `connectionName` and `dataSource` now genuinely default to each other (bidirectionally). `forRoot({ dataSource: 'stats' })` registers the NAMED connection `'stats'` (previously it silently registered the default connection), and `forFeature([E], { dataSource: 'stats' })` now injects the `'stats'` TransactionHost (previously it silently bound the repository to the default connection's manager — the wrong database).
  - `ConnectionRegistry` has been removed from both packages' public APIs. Its duplicate-registration warning misfired on every legitimate sequential app boot (e.g. jest suites) and Nest DI already surfaces genuine misconfigurations.

  **Fixes:**

  - Transaction-aware proxy: property writes and `jest.spyOn` on injected repositories now live in an overlay that stays visible inside AND outside `@Transactional()` (restore via `mockRestore()`/`delete` returns to live resolution). The proxy is fully lazy (no more `Cannot create proxy with a non-object as target` crash with partial mocks at module compile), bound methods are memoized per resolved instance (`proxy.save === proxy.save`), and a nullish resolution now throws a descriptive error.
  - `forRootAsync` no longer leaks `defaultTxOptions` from one app compile into the next when a later factory resolves no defaults.
  - `createNoOpTransactionalModule()` works with no arguments (previously threw `Either \`tx\` or \`txToken\` must be provided`).
  - `typesVersions` added so the `/testing` subpath types resolve for consumers on classic (node10) module resolution — e.g. Nest 10 default tsconfigs.
  - The tree-vs-plain repository decision is computed once per provider instead of twice per property access; repository property access now costs one CLS lookup plus one cached-map `getRepository`.
  - README: the programmatic-control example now injects `TransactionHost<TransactionalAdapterTypeOrm>` (the previous `TypeOrmTransactionHost` type alias is erased at runtime and cannot be a DI annotation — documented on the alias).
