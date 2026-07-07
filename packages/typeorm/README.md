# @nestjs-transactions/typeorm

**Declarative `@Transactional()` for NestJS + TypeORM.** Keep `@InjectRepository(Entity)`, add one decorator — transactions propagate through CLS (`AsyncLocalStorage`) across services. A drop-in replacement DX for the abandoned [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional), built entirely on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional) — standard NestJS DI, **zero monkey-patching**.

## Install

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies.)

## Quick start

```ts
// app.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionalModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [TypeOrmModule.forRoot({/* ... */}), TransactionalModule.forRoot()],
})
export class AppModule {}
```

Both root imports are required and do different jobs:

- **`TypeOrmModule.forRoot()`** (from `@nestjs/typeorm`) owns the **database connection** — the `DataSource`, pool, and entity metadata. Standard NestJS + TypeORM; nothing here is specific to this package.
- **`TransactionalModule.forRoot()`** owns **transaction propagation** — it registers the `@nestjs-cls/transactional` CLS plugin that powers `@Transactional()` (starting/committing/rolling back transactions and swapping the active `EntityManager`). It does **not** create a connection; it resolves the `DataSource` that `TypeOrmModule` registered.

Neither replaces the other: with only `TypeOrmModule`, `@Transactional()` does nothing; with only `TransactionalModule`, there is no `DataSource` to run transactions against. Register both once at the app root — this mirrors `typeorm-transactional`'s bootstrap, minus the monkey-patching (see [Migrating](#migrating-from-typeorm-transactional)).

```ts
// member.module.ts — use INSTEAD of TypeOrmModule.forFeature([Member])
@Module({
  imports: [TransactionalModule.forFeature([Member])],
  providers: [MemberService, AccountingService],
})
export class MemberModule {}
```

```ts
// member.service.ts — completely vanilla NestJS + TypeORM
import { Transactional } from '@nestjs-transactions/typeorm';

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
import { IsolationLevel, Transactional, TransactionalModule } from '@nestjs-transactions/typeorm';

TransactionalModule.forRoot({
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ },
});

// per call — options are typed for TypeORM, no type argument needed:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })

// resolved async (e.g. from ConfigService):
TransactionalModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    defaultTxOptions: { isolationLevel: config.get('DB_ISOLATION') },
  }),
});
```

## Multiple data sources

Name the connection after the data source (the convention — both default to each other):

```ts
TypeOrmModule.forRoot({ ...statsDbConfig, name: 'stats' }),
TransactionalModule.forRoot(),                            // default DataSource
TransactionalModule.forRoot({ connectionName: 'stats' }), // the 'stats' DataSource

TransactionalModule.forFeature([Member]),
TransactionalModule.forFeature([Stat], 'stats'),
```

```ts
@Transactional({ connectionName: 'stats' })
async recordStats() { /* wraps only the stats DataSource */ }
```

For `forFeature`, the object forms `{ connectionName: 'stats' }` and `{ dataSource: 'stats' }` are
equivalent to the string form — each side defaults to the other. If the connection name must differ
from the data source name, pass both explicitly:
`TransactionalModule.forFeature([Stat], { connectionName: 'stats', dataSource: 'statsDb' })`.

## Transaction hooks

Register callbacks from inside a `@Transactional()` method (or
`TransactionHost#withTransaction`) that fire after the transaction settles — the same
`runOnTransactionCommit` / `runOnTransactionRollback` / `runOnTransactionComplete` API as
`typeorm-transactional`:

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

`repo.extend()` and hand-rolled repository classes hold a fixed `EntityManager` and can't be silently intercepted. Extend the base class instead:

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

## Pros & cons vs `typeorm-transactional`

Honest tradeoffs of choosing this package over the incumbent. See [Migrating](#migrating-from-typeorm-transactional) below for the step-by-step API mapping and [Caveats](#caveats) for the full list.

| ✅ Pros                                                                                                                        | ⚠️ Cons                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **No monkey-patching** — plain NestJS DI + CLS; `typeorm-transactional` patches `DataSource`/`Repository` prototypes globally. | **More to install** — five peer dependencies vs `typeorm-transactional`'s single package.                                   |
| **Actively maintained foundation** — built on `@nestjs-cls/transactional`; `typeorm-transactional` is effectively abandoned.   | **A module swap** — replace `TypeOrmModule.forFeature([E])` with `TransactionalModule.forFeature([E])`.                     |
| **No bootstrap-ordering footgun** — no `initializeTransactionalContext()` that must run before any import.                     | **Younger, less battle-tested** — smaller community than `typeorm-transactional`'s large install base.                      |
| **Automatic DataSource wiring** — no `addTransactionalDataSource()`; uses `@nestjs/typeorm` tokens.                            | **Custom repos aren't auto-intercepted** — `repo.extend()`/hand-rolled repos need the `TransactionalRepository` base class. |
| **Type-safe isolation levels** — `IsolationLevel` enum kept in sync with TypeORM at compile time.                              |                                                                                                                             |
| **Zero runtime dependencies** — everything is a peer dep; composes cleanly with an existing `nestjs-cls` setup.                |                                                                                                                             |

## Migrating from `typeorm-transactional`

|              | `typeorm-transactional`                                           | `@nestjs-transactions/typeorm`                                                                            |
| ------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bootstrap    | `initializeTransactionalContext()` before everything              | `TransactionalModule.forRoot()` in `AppModule`                                                            |
| DataSource   | `addTransactionalDataSource(ds)`                                  | automatic (uses `@nestjs/typeorm` tokens)                                                                 |
| Repositories | `TypeOrmModule.forFeature([E])`                                   | `TransactionalModule.forFeature([E])`                                                                     |
| Decorator    | `@Transactional()`                                                | `@Transactional()` (unchanged)                                                                            |
| Propagation  | `@Transactional({ propagation: Propagation.REQUIRES_NEW })`       | `@Transactional({ propagation: Propagation.REQUIRES_NEW })` (same syntax)                                 |
| Isolation    | `@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })` | `@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })` (same syntax)                           |
| Hooks        | `runOnTransactionCommit/Rollback/Complete`                        | `runOnTransactionCommit/Rollback/Complete` (same functions — see [Transaction hooks](#transaction-hooks)) |
| Mechanism    | monkey-patches `DataSource`/`Repository` prototypes               | plain DI + CLS — nothing is patched                                                                       |

Steps: remove `initializeTransactionalContext()` and `addTransactionalDataSource()`, add `TransactionalModule.forRoot()`, swap `TypeOrmModule.forFeature` for `TransactionalModule.forFeature`, and update `Propagation`/`IsolationLevel`/hook imports. Services keep `@InjectRepository` + `@Transactional({ ... })` unchanged — the decorator's options-object syntax is the same as `typeorm-transactional`'s.

## Caveats

- **Don't register the same entity with both** `TypeOrmModule.forFeature` and `TransactionalModule.forFeature` in the same module — they claim the same token; the last registration wins.
- **`Promise.all` of queries inside one transaction** runs on a single database connection (a TypeORM/driver constraint shared by every transaction solution). Await sequentially inside transactions, or use `RequiresNew` for genuine parallelism.
- **`repo.extend()`** can't be intercepted — use `TransactionalRepository` (above).
- If your app already uses `nestjs-cls` (`ClsModule.forRoot`), everything just works: this package only registers a CLS _plugin_ and never calls `ClsModule.forRoot()` itself.

## License

MIT
