# @nestjs-transactions/core

## 0.4.4

### Patch Changes

- [#40](https://github.com/jubaerhosain/nestjs-transactions/pull/40) [`0f87b7a`](https://github.com/jubaerhosain/nestjs-transactions/commit/0f87b7a6728c7310d6ced44f3aa726ac4f4d5ed0) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add a `homepage` field pointing at the new documentation site
  (https://jubaerhosain.github.io/nestjs-transactions/) and slim the `prisma` and
  `core` READMEs to concise landing pages that link to the full docs (the
  `typeorm` README keeps its full manual). The comprehensive documentation now
  lives on the docs site as the single source of truth.

## 0.4.3

### Patch Changes

- [#33](https://github.com/jubaerhosain/nestjs-transactions/pull/33) [`82b09bf`](https://github.com/jubaerhosain/nestjs-transactions/commit/82b09bfc1eacd310d47adbd64cd7a54030bf9f2a) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add a `homepage` field pointing at the new documentation site
  (https://jubaerhosain.github.io/nestjs-transactions/) and slim the `prisma` and
  `core` READMEs to concise landing pages that link to the full docs (the
  `typeorm` README keeps its full manual). The comprehensive documentation now
  lives on the docs site as the single source of truth.

## 0.4.2

### Patch Changes

- [#19](https://github.com/jubaerhosain/nestjs-transactions/pull/19) [`2b49b23`](https://github.com/jubaerhosain/nestjs-transactions/commit/2b49b2344c010e90e3d6f12361fe33a2b162e9a4) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - docs: refresh package READMEs — benefits-first framing, reference `typeorm-transactional` as the inspiration, and replace "silent" wording with "declarative" / "transaction-aware". Publishes the updated README to the npm registry (npm only refreshes the README on a new version).

## 0.4.1

### Patch Changes

- [#9](https://github.com/jubaerhosain/nestjs-transactions/pull/9) [`ea17645`](https://github.com/jubaerhosain/nestjs-transactions/commit/ea17645e29878dedd55556c06fcada49eb4dd768) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Review fixes: document the transaction lifecycle hooks in the READMEs (the migration
  table wrongly said hooks were unsupported), retry the tree-repository detection when
  entity metadata is not yet available instead of freezing a wrong "plain" decision,
  log hook failures with a proper stack trace, and ship the LICENSE file in the
  published tarballs.

## 0.4.0

### Minor Changes

- [#7](https://github.com/jubaerhosain/nestjs-transactions/pull/7) [`9d6694d`](https://github.com/jubaerhosain/nestjs-transactions/commit/9d6694dcbb2d6c66b4889e2c23f6760f78da5073) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add transaction lifecycle hooks (`runOnTransactionCommit`,
  `runOnTransactionRollback`, `runOnTransactionComplete`) — a port of the
  `typeorm-transactional` API. Call them inside a `@Transactional()` method to
  register callbacks that run after the transaction commits, rolls back, or
  completes. Built on CLS with no monkey-patching; async callbacks are awaited
  sequentially and a throwing callback is caught and logged.

## 0.3.0

### Minor Changes

- [#2](https://github.com/jubaerhosain/nestjs-transactions/pull/2) [`3fde6fc`](https://github.com/jubaerhosain/nestjs-transactions/commit/3fde6fc4f72e59e4c0b72a5bebf1996d15dfc22a) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Typed, uniform enum surface for transaction options.

  - **`IsolationLevel` enum** (`@nestjs-transactions/typeorm`): set isolation with a typed,
    autocompletable value — `@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })`.
    Members map to TypeORM's isolation-level literals, so raw strings still work.
  - **`Transactional` is now typed for TypeORM**: options like `{ isolationLevel }` are inferred
    without a `<TransactionalAdapterTypeOrm>` type argument. Same runtime function (identity
    preserved) — only the option types are specialized.
  - **`Propagation` members are now SCREAMING_CASE** (`Propagation.REQUIRES_NEW` instead of
    `Propagation.RequiresNew`) for consistency with `IsolationLevel`. Each member is the
    underlying `@nestjs-cls/transactional` value, so it's accepted anywhere the library expects a
    propagation (decorator, `TransactionHost#withTransaction`). **Breaking:** update any
    `Propagation.PascalCase` usages to SCREAMING_CASE.

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
