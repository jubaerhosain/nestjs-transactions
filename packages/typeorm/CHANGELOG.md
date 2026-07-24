# @nestjs-transactions/typeorm

## 5.0.1

### Patch Changes

- [#33](https://github.com/jubaerhosain/nestjs-transactions/pull/33) [`82b09bf`](https://github.com/jubaerhosain/nestjs-transactions/commit/82b09bfc1eacd310d47adbd64cd7a54030bf9f2a) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add a `homepage` field pointing at the new documentation site
  (https://jubaerhosain.github.io/nestjs-transactions/) and slim the `prisma` and
  `core` READMEs to concise landing pages that link to the full docs (the
  `typeorm` README keeps its full manual). The comprehensive documentation now
  lives on the docs site as the single source of truth.
- Updated dependencies [[`82b09bf`](https://github.com/jubaerhosain/nestjs-transactions/commit/82b09bfc1eacd310d47adbd64cd7a54030bf9f2a)]:
  - @nestjs-transactions/core@0.4.3

## 5.0.0

### Major Changes

- [#35](https://github.com/jubaerhosain/nestjs-transactions/pull/35) [`73fa7c6`](https://github.com/jubaerhosain/nestjs-transactions/commit/73fa7c6b13e5f5b0650ba97e2b8ba34c62f2cdb6) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - **Breaking:** `TransactionalRepository` is renamed to `NestjsTypeormRepository` and now **extends TypeORM's `Repository<Entity>`**.

  - Subclasses call the full `Repository` API directly — `this.find()`, `this.save()`, `this.createQueryBuilder()`, … — and every inherited method runs on the current transaction's `EntityManager` inside `@Transactional()` (base manager outside).
  - The `this.repo` getter is removed: replace `this.repo.x()` with `this.x()`. `this.manager` (now the live, transaction-aware manager) and `this.txHost` remain. The constructor signature is unchanged (`super(Entity, txHost)`).
  - `.extend({ ... })` on subclass instances is now supported and stays transaction-aware (TypeORM's own implementation is overridden — it would pin the manager and mis-invoke the subclass constructor).
  - Tree entities: `TreeRepository` methods are not inherited — use `this.manager.getTreeRepository(this.target)` or `@InjectRepository`.

- [#35](https://github.com/jubaerhosain/nestjs-transactions/pull/35) [`73fa7c6`](https://github.com/jubaerhosain/nestjs-transactions/commit/73fa7c6b13e5f5b0650ba97e2b8ba34c62f2cdb6) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - **Breaking:** the two-module setup (`@nestjs/typeorm`'s `TypeOrmModule` + this package's `TransactionalModule`) is merged into a single unified `NestjsTypeormModule` exported from this package.

  - `TransactionalModule` is removed from the public surface. Use `NestjsTypeormModule.forRoot()` / `forRootAsync()` / `forFeature()` instead — same shape as `@nestjs/typeorm`'s module (full options passthrough, including `autoLoadEntities` and `retryAttempts`), plus the transactional options `defaultTxOptions` and `enableTransactionProxy`. `name` names both the DataSource and the transactional connection.
  - `InjectRepository`, `InjectDataSource`, `InjectEntityManager` and the token helpers are re-exported from `@nestjs/typeorm` (same symbols), so a single import covers the whole workflow.
  - Removed: attaching to an externally managed DataSource via `TransactionalModule.forRoot({ dataSource, imports })` — `forRoot` now always owns the DataSource.
  - Migration: replace `import { TypeOrmModule } from '@nestjs/typeorm'` + `import { TransactionalModule } from '@nestjs-transactions/typeorm'` with a single `import { NestjsTypeormModule } from '@nestjs-transactions/typeorm'`; delete `TransactionalModule.forRoot(...)` (move `defaultTxOptions`/`enableTransactionProxy` into `NestjsTypeormModule.forRoot(...)`), and rename both packages' `forFeature(...)` to `NestjsTypeormModule.forFeature(...)`.

## 4.0.4

### Patch Changes

- [#19](https://github.com/jubaerhosain/nestjs-transactions/pull/19) [`2b49b23`](https://github.com/jubaerhosain/nestjs-transactions/commit/2b49b2344c010e90e3d6f12361fe33a2b162e9a4) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - docs: refresh package READMEs — benefits-first framing, reference `typeorm-transactional` as the inspiration, and replace "silent" wording with "declarative" / "transaction-aware". Publishes the updated README to the npm registry (npm only refreshes the README on a new version).

- Updated dependencies [[`2b49b23`](https://github.com/jubaerhosain/nestjs-transactions/commit/2b49b2344c010e90e3d6f12361fe33a2b162e9a4)]:
  - @nestjs-transactions/core@0.4.2

## 4.0.3

### Patch Changes

- [#14](https://github.com/jubaerhosain/nestjs-transactions/pull/14) [`ec3900b`](https://github.com/jubaerhosain/nestjs-transactions/commit/ec3900bd266c2ac221e271c367b37810960c1172) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - docs: add an up-front Pros & Cons section comparing `@nestjs-transactions/typeorm`
  with `typeorm-transactional`, so readers can weigh the tradeoffs before install.

## 4.0.2

### Patch Changes

- [#12](https://github.com/jubaerhosain/nestjs-transactions/pull/12) [`68c2043`](https://github.com/jubaerhosain/nestjs-transactions/commit/68c2043e04af386516909a3226b8758e506aaf2a) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - docs: clarify that `TypeOrmModule.forRoot()` and `TransactionalModule.forRoot()`
  are both required and why — one owns the connection, the other owns transaction
  propagation. Also fix the missing `TypeOrmModule` import in the Quick start.

## 4.0.1

### Patch Changes

- [#9](https://github.com/jubaerhosain/nestjs-transactions/pull/9) [`ea17645`](https://github.com/jubaerhosain/nestjs-transactions/commit/ea17645e29878dedd55556c06fcada49eb4dd768) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Review fixes: document the transaction lifecycle hooks in the READMEs (the migration
  table wrongly said hooks were unsupported), retry the tree-repository detection when
  entity metadata is not yet available instead of freezing a wrong "plain" decision,
  log hook failures with a proper stack trace, and ship the LICENSE file in the
  published tarballs.
- Updated dependencies [[`ea17645`](https://github.com/jubaerhosain/nestjs-transactions/commit/ea17645e29878dedd55556c06fcada49eb4dd768)]:
  - @nestjs-transactions/core@0.4.1

## 4.0.0

### Minor Changes

- [#7](https://github.com/jubaerhosain/nestjs-transactions/pull/7) [`9d6694d`](https://github.com/jubaerhosain/nestjs-transactions/commit/9d6694dcbb2d6c66b4889e2c23f6760f78da5073) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add transaction lifecycle hooks (`runOnTransactionCommit`,
  `runOnTransactionRollback`, `runOnTransactionComplete`) — a port of the
  `typeorm-transactional` API. Call them inside a `@Transactional()` method to
  register callbacks that run after the transaction commits, rolls back, or
  completes. Built on CLS with no monkey-patching; async callbacks are awaited
  sequentially and a throwing callback is caught and logged.

### Patch Changes

- Updated dependencies [[`9d6694d`](https://github.com/jubaerhosain/nestjs-transactions/commit/9d6694dcbb2d6c66b4889e2c23f6760f78da5073)]:
  - @nestjs-transactions/core@0.4.0

## 3.0.0

### Major Changes

- [#5](https://github.com/jubaerhosain/nestjs-transactions/pull/5) [`0047114`](https://github.com/jubaerhosain/nestjs-transactions/commit/0047114627caaff3816856366362231efe990be3) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - **Breaking:** `@Transactional` now takes a single options object instead of positional arguments, matching `typeorm-transactional`'s ergonomics.

  ```ts
  // before (positional)
  @Transactional(Propagation.REQUIRES_NEW)
  @Transactional('stats')
  @Transactional('stats', Propagation.NESTED, { isolationLevel: IsolationLevel.SERIALIZABLE })

  // after (object)
  @Transactional({ propagation: Propagation.REQUIRES_NEW })
  @Transactional({ connectionName: 'stats' })
  @Transactional({ connectionName: 'stats', propagation: Propagation.NESTED, isolationLevel: IsolationLevel.SERIALIZABLE })
  ```

  `@Transactional()` (no arguments) is unchanged, and calls that already passed an options object (e.g. `@Transactional({ isolationLevel })`) keep working.

  Behavior is identical — the decorator still delegates to `@nestjs-cls/transactional` (no monkey-patching). The object form is also more robust: `connectionName` and `propagation` are separate keys, so a connection named like a propagation literal (e.g. `"REQUIRED"`) can no longer be misinterpreted.

  The `@nestjs-transactions/core` `Transactional` export is unchanged (still the positional `@nestjs-cls` decorator) for adapter authors.

  Also fixes connection resolution so an explicit `connectionName: 'default'` (and the string `'default'` form) now maps to the default connection — matching how `dataSource: 'default'` already behaves — instead of wiring repositories to a never-registered `'default'`-named `TransactionHost`. The `@Transactional` decorator applies the same normalization, so `@Transactional({ connectionName: 'default' })` targets the default connection instead of throwing "TransactionHost not initialized".

- [#5](https://github.com/jubaerhosain/nestjs-transactions/pull/5) [`0047114`](https://github.com/jubaerhosain/nestjs-transactions/commit/0047114627caaff3816856366362231efe990be3) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - **Breaking:** the custom-repository base class `TransactionAwareRepository` is renamed to `TransactionalRepository`, and it now receives the entity and `TransactionHost` through the constructor instead of an abstract `entity` field.

  ```ts
  // before
  import { TransactionAwareRepository } from '@nestjs-transactions/typeorm';

  @Injectable()
  export class MemberRepository extends TransactionAwareRepository<Member> {
    protected readonly entity = Member;

    findByEmail(email: string) {
      return this.repo.findOneBy({ email });
    }
  }

  // after
  import {
    TransactionalRepository,
    TransactionHost,
    TypeOrmAdapter,
  } from '@nestjs-transactions/typeorm';

  @Injectable()
  export class MemberRepository extends TransactionalRepository<Member> {
    constructor(txHost: TransactionHost<TypeOrmAdapter>) {
      super(Member, txHost);
    }

    findByEmail(email: string) {
      return this.repo.findOneBy({ email });
    }
  }
  ```

  `this.repo` / `this.manager` behave exactly as before — they always reflect the current transactional `EntityManager`. The constructor form makes user-defined base repositories plain generic subclasses (no mixin factories) that can also inject extra request context (e.g. `ClsService`) and pass it up via `super(...)`.

  **New (non-breaking):** `TypeOrmAdapter` — a concise re-export alias for `TransactionalAdapterTypeOrm`, for use in type positions like `TransactionHost<TypeOrmAdapter>`. The original `TransactionalAdapterTypeOrm` export is unchanged.

## 2.0.0

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

### Patch Changes

- Updated dependencies [[`3fde6fc`](https://github.com/jubaerhosain/nestjs-transactions/commit/3fde6fc4f72e59e4c0b72a5bebf1996d15dfc22a)]:
  - @nestjs-transactions/core@0.3.0

## 1.0.0

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

### Patch Changes

- Updated dependencies [[`bb2ea1d`](https://github.com/jubaerhosain/nestjs-transactions/commit/bb2ea1d89cfed07485060c0c2257c886ddabe922)]:
  - @nestjs-transactions/core@0.2.0
