# @nestjs-transactions/typeorm

**Declarative `@Transactional()` for NestJS + TypeORM.** Keep `@InjectRepository(Entity)`, add one decorator — transactions propagate through CLS (`AsyncLocalStorage`) across services. Standard NestJS dependency injection built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional): **no monkey-patching**. Inspired by [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) — a decorator-based approach many NestJS developers already know, but that is no longer maintained.

## Install

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies.)

## Quick start

Import `TypeOrmModule` from **this package instead of `@nestjs/typeorm`** — one
module owns both the database connection and transaction propagation:

```ts
// app.module.ts
import { TypeOrmModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [TypeOrmModule.forRoot({/* all @nestjs/typeorm options ... */})],
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
  imports: [TypeOrmModule.forFeature([Member])],
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
    await this.accounting.openAccount(member); // joins the SAME transaction —
    return member; // no decorator needed there
  }
}
```

If `register` throws, everything rolls back — including writes made in `AccountingService`. Outside a transaction the repository behaves like a plain TypeORM repository.

## How it works

`forFeature([Member])` registers a provider under TypeORM's standard repository token — the exact token `@InjectRepository` resolves — whose value is a lazy proxy over `txHost.tx.getRepository(Member)`. `txHost.tx` is the transactional `EntityManager` inside `@Transactional()` and the regular one outside. No prototypes are patched; it is ordinary NestJS dependency injection.

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
import { IsolationLevel, Transactional, TypeOrmModule } from '@nestjs-transactions/typeorm';

TypeOrmModule.forRoot({
  /* ...database options... */
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
});

// per call — options are typed for TypeORM, no type argument needed:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })

// resolved async (e.g. from ConfigService) — the factory returns the combined
// options (database + defaultTxOptions) and runs exactly once:
TypeOrmModule.forRootAsync({
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
module-definition time.

## Multiple data sources

`name` names both the DataSource and the transactional connection:

```ts
TypeOrmModule.forRoot(mainDbConfig),                       // default DataSource
TypeOrmModule.forRoot({ ...statsDbConfig, name: 'stats' }), // the 'stats' DataSource

TypeOrmModule.forFeature([Member]),
TypeOrmModule.forFeature([Stat], 'stats'),
```

```ts
@Transactional({ connectionName: 'stats' })
async recordStats() { /* wraps only the stats DataSource */ }
```

For `forFeature`, the object forms `{ connectionName: 'stats' }` and `{ dataSource: 'stats' }` are
equivalent to the string form — each side defaults to the other. If the connection name must differ
from the data source name, pass both explicitly:
`TypeOrmModule.forFeature([Stat], { connectionName: 'stats', dataSource: 'statsDb' })`.

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

`repo.extend()` and hand-rolled repository classes hold a fixed `EntityManager` and can't be intercepted. Extend the base class instead:

```ts
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
    return this.repo.findOneBy({ email }); // this.repo tracks the current transaction
  }
}
```

Share behaviour across repositories with your own generic base — a plain abstract subclass, no factories, that can also pull in extra request context and pass it up via `super(...)`:

```ts
export abstract class BaseRepository<E extends ObjectLiteral> extends TransactionalRepository<E> {
  constructor(
    entity: EntityTarget<E>,
    txHost: TransactionHost<TypeOrmAdapter>,
    protected readonly cls: ClsService,
  ) {
    super(entity, txHost);
  }

  findAll(): Promise<E[]> {
    return this.repo.find();
  }
}
```

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

## Coming from `typeorm-transactional`?

If you're used to marking methods `@Transactional()` and letting your repositories run inside the transaction, the setup here is deliberately small:

- Change the `TypeOrmModule` import line to this package — `forRoot`/`forFeature` keep their `@nestjs/typeorm` shape (no global bootstrap call before startup, no manual data-source registration).
- Keep your services exactly as they are: `@InjectRepository(Entity)` plus `@Transactional({ ... })`, with the same options-object syntax for `Propagation`, `IsolationLevel`, and the lifecycle hooks.

## Migrating from v4 (`TransactionalModule`)

v5 merges the two-module setup into the single `TypeOrmModule`:

- Replace `import { TypeOrmModule } from '@nestjs/typeorm'` + `import { TransactionalModule } from '@nestjs-transactions/typeorm'` with a single `import { TypeOrmModule } from '@nestjs-transactions/typeorm'`.
- Delete the `TransactionalModule.forRoot(...)` lines; move `defaultTxOptions` / `enableTransactionProxy` into `TypeOrmModule.forRoot({ ...dbOptions, ... })`. `name` now also names the transactional connection (`connectionName` is gone from the root options).
- Rename `TransactionalModule.forFeature(...)` to `TypeOrmModule.forFeature(...)` — same signature.
- Attaching to an externally managed DataSource (`TransactionalModule.forRoot({ dataSource, imports })`) is no longer part of the public surface — `forRoot` always owns the DataSource.

## Caveats

- **Use this package's `TypeOrmModule` instead of `@nestjs/typeorm`'s, never both.** In particular, don't register the same entity with both packages' `forFeature` in the same module — they claim the same token; the last registration wins.

  Both mix-up directions are caught at startup: `@nestjs/typeorm`'s `forRoot` + our `forFeature` aborts with a guided error (no transactional connection is registered), and the reverse — our `forRoot` + their `forFeature`, which would otherwise **boot fine while the plain repositories silently bypass `@Transactional()`** — fails the boot too: every connection runs a repository-conflict check that detects un-proxied `Repository` providers on its DataSource and throws, naming the entities. Tune it per connection with `repositoryConflictCheck` in `forRoot`/`forRootAsync` (static): `'error'` (default), `'warn'` (log and continue), or `'off'` (e.g. when intentionally keeping non-transactional raw-repository providers).

  As defense-in-depth, also guard the import at the source with ESLint — it catches the mistake at lint time and covers the one runtime blind spot (the same entity registered with **both** packages' `forFeature` on one connection, where our proxy legitimately claims the token):

  ```js
  // eslint.config — make the wrong import impossible to write
  'no-restricted-imports': ['error', {
    paths: [{
      name: '@nestjs/typeorm',
      importNames: ['TypeOrmModule'],
      message: "Import TypeOrmModule from '@nestjs-transactions/typeorm' instead — @nestjs/typeorm's module bypasses @Transactional().",
    }],
  }],
  ```

  (Other `@nestjs/typeorm` imports stay fine — `InjectRepository` etc. are the same symbols either way, and this package re-exports them.)

- **`Promise.all` of queries inside one transaction** runs on a single database connection (a TypeORM/driver constraint shared by every transaction solution). Await sequentially inside transactions, or use `RequiresNew` for genuine parallelism.
- **`repo.extend()`** can't be intercepted — use `TransactionalRepository` (above).
- If your app already uses `nestjs-cls` (`ClsModule.forRoot`), everything just works: this package only registers a CLS _plugin_ and never calls `ClsModule.forRoot()` itself.

## License

MIT
