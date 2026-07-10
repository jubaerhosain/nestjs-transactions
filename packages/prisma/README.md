# @nestjs-transactions/prisma

Declarative `@Transactional()` for NestJS + Prisma. Inject **one**
transaction-aware Prisma client and drop the `$transaction` boilerplate —
transactions propagate silently through CLS (`AsyncLocalStorage`) across
services. Built entirely on
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/); **no
monkey-patching**, standard NestJS DI throughout.

## Install

```bash
npm install @nestjs-transactions/prisma @nestjs-transactions/core @nestjs-cls/transactional @nestjs-cls/transactional-adapter-prisma nestjs-cls
```

## Quick start

Provide your Prisma client the canonical NestJS way:

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

Register the transactional module once:

```ts
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

Then inject the transaction-aware client anywhere:

```ts
@Injectable()
export class UserService {
  constructor(@InjectPrismaClient() private readonly prisma: Prisma.TransactionClient) {}

  @Transactional()
  async signUp(email: string) {
    const user = await this.prisma.user.create({ data: { email } });
    await this.prisma.audit.create({ data: { userId: user.id } });
    // both commit together; any throw rolls both back
    runOnTransactionCommit(() => this.mailer.sendWelcome(email));
    return user;
  }
}
```

Inside `@Transactional()` the injected client is the active transaction client;
outside it is the base client. Calls to other `@Transactional()` methods join
the same transaction by default (`Propagation.REQUIRED`) — or choose
`REQUIRES_NEW`, `NESTED` (savepoints), `NOT_SUPPORTED`, etc.:

```ts
@Transactional({ propagation: Propagation.REQUIRES_NEW, timeout: 30_000 })
```

Set the isolation level with the `IsolationLevel` enum (autocomplete, no
typos) — it is accepted anywhere Prisma's raw isolation string is:

```ts
import { IsolationLevel } from '@nestjs-transactions/prisma';

@Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
```

## Unit testing

```ts
import { createNoOpPrismaTransactionalModule } from '@nestjs-transactions/prisma/testing';

Test.createTestingModule({
  imports: [createNoOpPrismaTransactionalModule({ client: mockClient })],
  providers: [UserService],
});
```

`@Transactional()` no-ops and `@InjectPrismaClient()` resolves a proxy over
your mock.

## Notes & limitations

- **Prisma 7 / custom client output:** the API is generic over your client
  type — annotate injection sites with your generated `Prisma.TransactionClient`
  (or `PrismaTransactionalClient<MyClient>`); `prismaToken` can be any DI token,
  including one holding an `$extends`-ed client.
- **Timeout:** Prisma's interactive transactions default to a **5s timeout**
  (error `P2028`). Raise it via `defaultTxOptions: { timeout }` in `forRoot` or
  per call.
- `Propagation.NESTED` requires `sqlFlavor` (savepoints are emulated with raw
  SQL — not available on MongoDB). Without `sqlFlavor`, a `NESTED` call inside
  a transaction logs a warning and runs as an **independent** transaction
  (like `REQUIRES_NEW`) — it does not join the outer one.
- The sequential/batch `$transaction([...])` form is not supported (inherent to
  the CLS design). `REQUIRES_NEW` uses a second pooled connection.
