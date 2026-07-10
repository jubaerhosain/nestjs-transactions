# @nestjs-transactions/prisma

**Declarative `@Transactional()` for NestJS + Prisma.** Inject **one**
transaction-aware Prisma client, add one decorator, and drop the `$transaction`
boilerplate — transactions propagate through CLS (`AsyncLocalStorage`) across
services. Standard NestJS dependency injection built on the actively maintained
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional):
**no monkey-patching**. The same decorator-based ergonomics the
`@nestjs-transactions/typeorm` adapter offers, for Prisma.

## Install

```bash
npm install @nestjs-transactions/prisma @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-prisma nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies.)

## Quick start

Provide your Prisma client the canonical NestJS way:

```ts
// prisma.module.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

> **Prisma 7 / driver adapters.** Prisma 7 requires a driver adapter. Pass it to
> the `PrismaClient` constructor exactly as you would without this package —
> nothing here changes:
>
> ```ts
> import { PrismaPg } from '@prisma/adapter-pg';
>
> @Injectable()
> export class PrismaService extends PrismaClient implements OnModuleInit {
>   constructor() {
>     super({ adapter: new PrismaPg({ connectionString }) });
>   }
>   async onModuleInit() {
>     await this.$connect();
>   }
> }
> ```

Register the transactional module once at the app root:

```ts
// app.module.ts
import { TransactionalModule } from '@nestjs-transactions/prisma';

@Module({
  imports: [
    PrismaModule,
    TransactionalModule.forRoot({
      prismaToken: PrismaService,
      sqlFlavor: 'postgresql', // enables Propagation.NESTED (savepoints)
      imports: [PrismaModule],
    }),
  ],
})
export class AppModule {}
```

What each option does:

- **`prismaToken`** _(required)_ — the DI token your `PrismaClient`/`PrismaService`
  is provided under. It can be any token, including a string token holding an
  `$extends`-ed client.
- **`imports`** — the module(s) that export the client under `prismaToken`, so the
  adapter can resolve it (here, `PrismaModule` — note it `exports: [PrismaService]`).
- **`sqlFlavor`** — required only for `Propagation.NESTED`, which emulates
  savepoints with raw SQL (see [Propagation](#propagation)).
- **`defaultTxOptions`** — default `$transaction` options (`timeout`, `maxWait`,
  `isolationLevel`) for every transaction (see [Transaction options](#transaction-options)).

`TransactionalModule.forRoot()` registers the `@nestjs-cls/transactional` CLS
plugin that powers `@Transactional()`; it does **not** create a connection — it
resolves the client you already provide. Unlike the TypeORM adapter, there is
**no `forFeature`**: Prisma has no per-entity registration, so one `forRoot()` is
the whole setup.

Then inject the transaction-aware client anywhere:

```ts
// user.service.ts
import {
  InjectPrismaClient,
  Transactional,
  runOnTransactionCommit,
} from '@nestjs-transactions/prisma';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(
    @InjectPrismaClient() private readonly prisma: Prisma.TransactionClient,
    private readonly audit: AuditService,
  ) {}

  @Transactional()
  async signUp(email: string) {
    const user = await this.prisma.user.create({ data: { email } });
    await this.audit.record(user.id); // joins the SAME transaction — no decorator needed there
    runOnTransactionCommit(() => this.mailer.sendWelcome(email)); // only after COMMIT
    return user;
  }
}
```

If `signUp` throws, everything rolls back — including writes made in
`AuditService`. Outside a transaction the injected client behaves like the plain
base client. Calls to other `@Transactional()` methods join the same transaction
by default (`Propagation.REQUIRED`).

## How it works

`@InjectPrismaClient()` resolves a provider whose value is a lazy proxy over
`txHost.tx` (core's `createTransactionAwareProxy`). `txHost.tx` is the active
interactive-transaction client inside a `@Transactional()` method and the base
client outside it. Because the proxy re-resolves on every property access, one
injected client silently follows the current transaction. No prototypes are
patched; it is ordinary NestJS dependency injection.

## Propagation

```ts
import { Propagation, Transactional } from '@nestjs-transactions/prisma';

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

`Propagation.NESTED` requires `sqlFlavor` (savepoints are emulated with raw SQL —
not available on MongoDB). **Without `sqlFlavor`, a `NESTED` call inside a
transaction logs a warning and runs as an _independent_ transaction (like
`REQUIRES_NEW`) — it does not join the outer one.** `REQUIRES_NEW` (and the
`NESTED` fallback) take a second pooled connection.

## Transaction options

The tx options are Prisma's native interactive-`$transaction` options —
`timeout`, `maxWait`, and `isolationLevel`. Set them per call, or as
`defaultTxOptions` for every transaction:

```ts
@Transactional({ propagation: Propagation.REQUIRES_NEW, timeout: 30_000, maxWait: 5_000 })
async audit(entry: AuditEntry) { /* ... */ }
```

Use the `IsolationLevel` enum for autocomplete and typo-free values (its members
map to Prisma's isolation-level literals, so a raw string still works too):

```ts
import { IsolationLevel, Transactional, TransactionalModule } from '@nestjs-transactions/prisma';

TransactionalModule.forRoot({
  prismaToken: PrismaService,
  imports: [PrismaModule],
  defaultTxOptions: { isolationLevel: IsolationLevel.REPEATABLE_READ, timeout: 10_000 },
});

// per call — overrides the defaults:
@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
```

Resolve the defaults asynchronously (e.g. from `ConfigService`) with
`forRootAsync`. Only `defaultTxOptions` is resolved at DI time; `prismaToken`,
`sqlFlavor`, and `connectionName` stay static:

```ts
TransactionalModule.forRootAsync({
  prismaToken: PrismaService,
  imports: [PrismaModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    defaultTxOptions: { timeout: config.get('DB_TX_TIMEOUT') },
  }),
});
```

## Multiple connections

Register one `forRoot()` per connection, naming all but the default with
`connectionName`:

```ts
TransactionalModule.forRoot({ prismaToken: PrismaService, sqlFlavor: 'postgresql', imports: [PrismaModule] }),
TransactionalModule.forRoot({
  prismaToken: AnalyticsPrismaService,
  sqlFlavor: 'postgresql',
  imports: [AnalyticsPrismaModule],
  connectionName: 'analytics',
}),
```

Inject the client for a given connection by name, and target it per call:

```ts
constructor(
  @InjectPrismaClient() private readonly prisma: Prisma.TransactionClient,
  @InjectPrismaClient('analytics') private readonly analytics: Prisma.TransactionClient,
) {}

@Transactional({ connectionName: 'analytics' })
async recordStats() { /* wraps only the 'analytics' connection */ }
```

Each connection's transactions (and hooks) run independently. The name
`'default'` is treated as the default connection.

## Transaction hooks

Register callbacks from inside a `@Transactional()` method (or
`TransactionHost#withTransaction`) that fire after the transaction settles, via
the `runOnTransactionCommit` / `runOnTransactionRollback` /
`runOnTransactionComplete` API:

```ts
import { runOnTransactionCommit, runOnTransactionRollback, Transactional } from '@nestjs-transactions/prisma';

@Transactional()
async signUp(email: string) {
  const user = await this.prisma.user.create({ data: { email } });
  runOnTransactionCommit(() => this.mailer.sendWelcome(email));   // only after COMMIT
  runOnTransactionRollback((err) => this.metrics.signUpFailed(err));
  return user;
}
```

- Hooks attach to the **innermost active** transaction: a `REQUIRES_NEW` or
  `NESTED` block's hooks fire on its own outcome; a `REQUIRED`-joined method's
  hooks fire with the outer transaction.
- Async hooks are awaited sequentially (in registration order) before the
  transactional method's promise settles; commit hooks run on the **base** client
  (the transaction has already committed), so queries through the injected client
  inside them work.
- A throwing hook is caught and logged — it never masks the method's own result,
  and the remaining hooks still run. `runOnTransactionComplete` receives the
  rollback error, or `undefined` on commit.
- Registering a hook outside an active transaction (including inside a suspended
  `NOT_SUPPORTED`/`NEVER` scope) throws.

## Programmatic control

Inject the `TransactionHost` for imperative control without the decorator:

```ts
import { PrismaAdapter, TransactionHost } from '@nestjs-transactions/prisma';

constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

await this.txHost.withTransaction(async () => { /* ... */ });
this.txHost.isTransactionActive();
this.txHost.tx; // the current transaction client
```

For a named connection, inject with `@InjectTransactionHost('analytics')`.

Alternatively, inject the raw active-transaction client directly with
`@InjectTransaction()`. This requires `enableTransactionProxy: true` in
`forRoot()`; outside a transaction it falls back to the base client:

```ts
import { InjectTransaction, Transaction, PrismaAdapter } from '@nestjs-transactions/prisma';

// forRoot({ ..., enableTransactionProxy: true })

constructor(@InjectTransaction() private readonly tx: Transaction<PrismaAdapter>) {}

@Transactional()
async create(email: string) {
  await this.tx.user.create({ data: { email } });
}
```

## Unit testing

```ts
import { createNoOpPrismaTransactionalModule } from '@nestjs-transactions/prisma/testing';

const mockClient = { user: { create: jest.fn() } };
const moduleRef = await Test.createTestingModule({
  imports: [createNoOpPrismaTransactionalModule({ client: mockClient })],
  providers: [UserService],
}).compile();
```

`@Transactional()` methods run without real transactions and `@InjectPrismaClient()`
resolves a proxy over your mock. Transaction hooks still fire. Pass
`connectionName` to stand in for a named connection.

## Caveats

- **`Propagation.NESTED` needs `sqlFlavor`.** Without it, a `NESTED` call inside a
  transaction logs a warning and opens an **independent** transaction
  (`REQUIRES_NEW`-like) instead of joining the outer one. Savepoints aren't
  available on MongoDB.
- **Default timeout is 5s.** Prisma's interactive transactions default to a **5s**
  timeout (error `P2028`). Raise it via `defaultTxOptions: { timeout }` in
  `forRoot` or per call.
- **No sequential/batch `$transaction([...])`.** Only the interactive
  (callback) form is supported — inherent to the CLS design. `REQUIRES_NEW` uses a
  second pooled connection.
- **Prisma 7 / custom client output.** The API is generic over your client type —
  annotate injection sites with your generated `Prisma.TransactionClient` (or
  `PrismaTransactionalClient<MyClient>`). `prismaToken` can be any DI token,
  including one holding an `$extends`-ed client.
- **Existing `nestjs-cls`.** If your app already calls `ClsModule.forRoot(...)`,
  everything just works: this package only registers a CLS _plugin_ and never
  calls `ClsModule.forRoot()` itself, so your host CLS state stays readable inside
  `@Transactional()`.

## License

MIT
