# @nestjs-transactions/typeorm

[![npm version](https://img.shields.io/npm/v/%40nestjs-transactions%2Ftypeorm)](https://www.npmjs.com/package/@nestjs-transactions/typeorm)
[![npm downloads](https://img.shields.io/npm/dm/%40nestjs-transactions%2Ftypeorm)](https://www.npmjs.com/package/@nestjs-transactions/typeorm)
[![CI](https://img.shields.io/github/actions/workflow/status/jubaerhosain/nestjs-transactions/ci.yml?branch=main&label=CI)](https://github.com/jubaerhosain/nestjs-transactions/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40nestjs-transactions%2Ftypeorm)](https://github.com/jubaerhosain/nestjs-transactions/blob/main/LICENSE)

**Declarative `@Transactional()` for NestJS + TypeORM.** Keep `@InjectRepository(Entity)`, add one decorator — transactions propagate through CLS (`AsyncLocalStorage`) across services. Standard NestJS dependency injection built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional): **no monkey-patching**. Inspired by [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) — a decorator-based approach many NestJS developers already know, but that is no longer maintained.

📖 **[Full documentation → jubaerhosain.github.io/nestjs-transactions/docs/typeorm](https://jubaerhosain.github.io/nestjs-transactions/docs/typeorm)**

## Install

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs/typeorm typeorm @nestjs-cls/transactional \
  @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies. `@nestjs/common` and `@nestjs/core` are peers too, but every NestJS app already has them.)

## Quick start

Use `NestjsTypeormModule` from **this package instead of `@nestjs/typeorm`'s
`TypeOrmModule`** — one module owns both the database connection and transaction
propagation:

```ts
// app.module.ts
import { NestjsTypeormModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [NestjsTypeormModule.forRoot({/* all @nestjs/typeorm options ... */})],
})
export class AppModule {}
```

`forRoot()` accepts everything `@nestjs/typeorm`'s does (`autoLoadEntities`,
`retryAttempts`, `name`, …) — it delegates DataSource creation to
`@nestjs/typeorm` internally — plus the transactional options
`defaultTxOptions` and `enableTransactionProxy`. It also registers the
`@nestjs-cls/transactional` CLS plugin that powers `@Transactional()`
(starting/committing/rolling back transactions and swapping the active
`EntityManager`).

```ts
// member.module.ts — same shape as @nestjs/typeorm's forFeature
@Module({
  imports: [NestjsTypeormModule.forFeature([Member])],
  providers: [MemberService, AccountingService],
})
export class MemberModule {}
```

```ts
// member.service.ts — completely vanilla NestJS + TypeORM
// (InjectRepository is re-exported — @nestjs/typeorm's symbol, one import)
import { InjectRepository, Transactional } from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    private readonly accounting: AccountingService,
  ) {}

  @Transactional()
  async register(name: string) {
    const member = await this.repo.save({ name });
    await this.accounting.openAccount(member); // joins the SAME transaction
    return member; // no decorator needed there
  }
}
```

If `register` throws, everything rolls back — including writes made in `AccountingService`. Outside a transaction the repository behaves like a plain TypeORM repository.

## Features

- **Propagation** — `REQUIRED`, `REQUIRES_NEW`, `NESTED`, `MANDATORY`, `NEVER`, `SUPPORTS`, `NOT_SUPPORTED`.
- **Isolation levels** — type-safe `IsolationLevel` enum, per-call or as defaults.
- **Multiple data sources** — named connections.
- **Transaction hooks** — `runOnTransactionCommit` / `Rollback` / `Complete`.
- **Programmatic control** — `TransactionHost` without the decorator.
- **Custom repositories** — the `NestjsTypeormRepository` base class.
- **Testing** — a no-op module for unit tests without a database.
- **Migration** — a drop-in path from `typeorm-transactional`.

## Propagation

```ts
import { Propagation, Transactional } from '@nestjs-transactions/typeorm';

@Transactional({ propagation: Propagation.REQUIRES_NEW })
async audit(entry: AuditEntry) { /* commits even if the caller rolls back */ }
```

| Mode                   | Behavior                                            |
| ---------------------- | --------------------------------------------------- |
| `REQUIRED` _(default)_ | Join the current transaction, or start one          |
| `REQUIRES_NEW`         | Always start an independent transaction             |
| `NESTED`               | Savepoint: inner rollback doesn't kill the outer tx |
| `MANDATORY`            | Throw `TransactionNotActiveError` if no transaction |
| `NEVER`                | Throw `TransactionAlreadyActiveError` if inside one |
| `SUPPORTS`             | Join if present, run plainly otherwise              |
| `NOT_SUPPORTED`        | Suspend the transaction for this call               |

## Transaction options

Use the `IsolationLevel` enum for autocomplete and typo-free values (its members map to
TypeORM's isolation-level literals, so a raw string still works too):

```ts
import { IsolationLevel, NestjsTypeormModule, Transactional } from '@nestjs-transactions/typeorm';

NestjsTypeormModule.forRoot({
  /* ...database options... */
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
});

// per call — options are typed for TypeORM, no type argument needed:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })

// resolved async (e.g. from ConfigService) — the factory returns the combined
// options (database + defaultTxOptions) and runs exactly once:
NestjsTypeormModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    url: config.get('DATABASE_URL'),
    type: 'postgres',
    defaultTxOptions: { isolationLevel: config.get('DB_ISOLATION') },
  }),
});
```

In `forRootAsync`, `name` and `enableTransactionProxy` must be static (on the
outer options object, not returned by the factory) — DI tokens are computed at
module-definition time. `forRootAsync` is factory-only: `@nestjs/typeorm`'s
`useClass`/`useExisting` forms are not supported (wrap such a provider in
`useFactory`/`inject` instead).

## Multiple data sources

`name` names both the DataSource and the transactional connection:

```ts
NestjsTypeormModule.forRoot(mainDbConfig),                       // default DataSource
NestjsTypeormModule.forRoot({ ...statsDbConfig, name: 'stats' }), // the 'stats' DataSource

NestjsTypeormModule.forFeature([Member]),
NestjsTypeormModule.forFeature([Stat], 'stats'),
```

```ts
@Transactional({ connectionName: 'stats' })
async recordStats() { /* wraps only the stats DataSource */ }
```

For `forFeature`, the string form and the single-key object forms
`{ connectionName: 'stats' }` / `{ dataSource: 'stats' }` are all equivalent — each side defaults
to the other. The unified module always names the transactional connection after the DataSource
(`forRoot({ name })` sets both), so a **split** `{ connectionName, dataSource }` whose two names
differ is not supported here — `forFeature` rejects it at startup with a guided error. That
combination only applies to advanced hand-wired setups built on `provideTransactionAwareRepository`.

## Transaction hooks

Register callbacks from inside a `@Transactional()` method (or
`TransactionHost#withTransaction`) that fire after the transaction settles, via the
`runOnTransactionCommit` / `runOnTransactionRollback` / `runOnTransactionComplete` API:

```ts
import { runOnTransactionCommit, runOnTransactionRollback, Transactional } from '@nestjs-transactions/typeorm';

@Transactional()
async register(name: string) {
  const member = await this.repo.save({ name });
  runOnTransactionCommit(() => this.mailer.sendWelcome(member)); // only after COMMIT
  runOnTransactionRollback((err) => this.metrics.registrationFailed(err));
  return member;
}
```

- Hooks attach to the **innermost active** transaction: a `REQUIRES_NEW` or `NESTED` block's
  hooks fire on its own outcome; a `REQUIRED`-joined method's hooks fire with the outer
  transaction.
- Async hooks are awaited sequentially (in registration order) before the transactional
  method's promise settles; commit hooks run on the **base** connection (the transaction has
  already committed), so repository calls inside them work.
- A throwing hook is caught and logged — it never masks the method's own result, and the
  remaining hooks still run. `runOnTransactionComplete` receives the rollback error, or
  `undefined` on commit.
- Registering a hook outside an active transaction (including inside a suspended
  `NOT_SUPPORTED`/`NEVER` scope) throws.

## Programmatic control

```ts
import { TransactionalAdapterTypeOrm, TransactionHost } from '@nestjs-transactions/typeorm';

constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

await this.txHost.withTransaction(async () => { /* ... */ });
this.txHost.isTransactionActive();
this.txHost.tx; // the current EntityManager
```

For a named connection inject with `@InjectTransactionHost('stats')`.

## Custom repositories

Hand-rolled repository classes (and a plain repository's `.extend()`) hold a fixed `EntityManager` and can't be intercepted. Extend `NestjsTypeormRepository` instead — your class **is** a `Repository<Entity>`: every inherited method (`this.find()`, `this.save()`, `this.createQueryBuilder()`, …) runs on the current transaction's `EntityManager` inside `@Transactional()` and on the base manager outside:

```ts
import {
  NestjsTypeormRepository,
  TransactionHost,
  TypeOrmAdapter,
} from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberRepository extends NestjsTypeormRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  findByEmail(email: string) {
    return this.findOneBy({ email }); // inherited — tracks the current transaction
  }
}
```

Share behaviour across repositories with your own generic base — a plain abstract subclass, no factories, that can also pull in extra request context and pass it up via `super(...)`:

```ts
export abstract class BaseRepository<E extends ObjectLiteral> extends NestjsTypeormRepository<E> {
  constructor(
    entity: EntityTarget<E>,
    txHost: TransactionHost<TypeOrmAdapter>,
    protected readonly cls: ClsService,
  ) {
    super(entity, txHost);
  }

  findAll(): Promise<E[]> {
    return this.find();
  }
}
```

Notes:

- `.extend({ ... })` **on a subclass instance** is supported and stays transaction-aware (the class overrides TypeORM's implementation, which would otherwise pin the manager).
- Tree entities: `TreeRepository`'s extra methods aren't inherited — call `this.manager.getTreeRepository(this.target)` inside a method (still transaction-aware), or inject with `@InjectRepository` (its provider resolves a `TreeRepository`).
- Don't re-declare `manager` (or `target`/`queryRunner`) as a field in a subclass — a class field would bury the live `manager` accessor the base installs.

## Testing

```ts
import { createNoOpTypeOrmTransactionalModule } from '@nestjs-transactions/typeorm/testing';

const repoMock = { save: jest.fn() };
const moduleRef = await Test.createTestingModule({
  imports: [
    createNoOpTypeOrmTransactionalModule({
      manager: { getRepository: () => repoMock },
      entities: [Member],
    }),
  ],
  providers: [MemberService],
}).compile();
```

`@Transactional()` methods run without real transactions and `@InjectRepository(Member)` resolves to your mock.

To unit-test a `NestjsTypeormRepository` subclass this way, remember its inherited methods call the **manager** directly (`manager.find(Member, ...)`, `manager.save(Member, ...)`) and `this.metadata` reads `manager.connection.getMetadata(...)` — so either give the mock `manager` those methods, or simply override the subclass provider with a mock in the testing module.

## Coming from `typeorm-transactional`?

If you're used to marking methods `@Transactional()` and letting your repositories run inside the transaction, the setup here is deliberately small:

- Swap `@nestjs/typeorm`'s `TypeOrmModule` for this package's `NestjsTypeormModule` — `forRoot`/`forFeature` keep their `@nestjs/typeorm` shape (no global bootstrap call before startup, no manual data-source registration).
- Keep your services exactly as they are: `@InjectRepository(Entity)` plus `@Transactional({ ... })`, with the same options-object syntax for `Propagation`, `IsolationLevel`, and the lifecycle hooks.

## Migrating from v4 (`TransactionalModule`)

v5 merges the two-module setup into the single `NestjsTypeormModule`:

- Replace `import { TypeOrmModule } from '@nestjs/typeorm'` + `import { TransactionalModule } from '@nestjs-transactions/typeorm'` with a single `import { NestjsTypeormModule } from '@nestjs-transactions/typeorm'`.
- Delete the `TransactionalModule.forRoot(...)` lines; move `defaultTxOptions` / `enableTransactionProxy` into `NestjsTypeormModule.forRoot({ ...dbOptions, ... })`. `name` now also names the transactional connection (`connectionName` is gone from the root options).
- Rename both `TypeOrmModule.forFeature(...)` and `TransactionalModule.forFeature(...)` to `NestjsTypeormModule.forFeature(...)` — same signature.
- `TransactionalRepository` is renamed **`NestjsTypeormRepository`** and now extends TypeORM's `Repository<Entity>`: replace `this.repo.x()` with `this.x()` (the `this.repo` getter is gone; `this.manager` and `this.txHost` remain). Same constructor signature (`super(Entity, txHost)`).
- Attaching to an externally managed DataSource (`TransactionalModule.forRoot({ dataSource, imports })`) is no longer part of the public surface — `forRoot` always owns the DataSource. If your app must keep managing the DataSource itself, register the CLS plugin directly with [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional) (`ClsModule.forRoot({ plugins: [new ClsPluginTransactional({ adapter: new TransactionalAdapterTypeOrm({ dataSourceToken }) })] })`) and wire repositories with `provideTransactionAwareRepository`.

## Caveats

- **Register the DataSource with `NestjsTypeormModule`, and repositories with `NestjsTypeormModule.forFeature`.** Repositories registered instead with `@nestjs/typeorm`'s `TypeOrmModule.forFeature` (or hand-rolled `Repository` providers) are plain repositories bound to the base `EntityManager` — they **bypass `@Transactional()`** and their writes escape rollback. Keep both on this package's module, and don't register the same entity with both packages' `forFeature` in one module (they claim the same token; the last registration wins). For custom repository classes, extend `NestjsTypeormRepository` (above) rather than `Repository`.
- **`Promise.all` of queries inside one transaction** runs on a single database connection (a TypeORM/driver constraint shared by every transaction solution). Await sequentially inside transactions, or use `Propagation.REQUIRES_NEW` for genuine parallelism.
- **`repo.extend()` on a plain repository** can't be intercepted — use `NestjsTypeormRepository` (above), whose subclasses support a transaction-aware `.extend()`.
- If your app already uses `nestjs-cls` (`ClsModule.forRoot`), everything just works: this package only registers a CLS _plugin_ and never calls `ClsModule.forRoot()` itself.

## License

MIT
