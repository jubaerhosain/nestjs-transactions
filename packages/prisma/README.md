# @nestjs-transactions/prisma

**Declarative `@Transactional()` for NestJS + Prisma.** Inject **one** transaction-aware Prisma client, add one decorator, and drop the `$transaction` boilerplate — transactions propagate through CLS (`AsyncLocalStorage`) across services. Standard NestJS dependency injection built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional): **no monkey-patching**. The same decorator-based ergonomics the `@nestjs-transactions/typeorm` adapter offers, for Prisma.

📖 **[Full documentation → jubaerhosain.github.io/nestjs-transactions/docs/prisma](https://jubaerhosain.github.io/nestjs-transactions/docs/prisma)**

## Install

```bash
npm install @nestjs-transactions/prisma @nestjs-transactions/core \
  @prisma/client @nestjs-cls/transactional \
  @nestjs-cls/transactional-adapter-prisma nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies. `@nestjs/common` and `@nestjs/core` are peers too, but every NestJS app already has them.)

## Quick start

Provide your Prisma client the canonical NestJS way, then register the transactional module once at the app root:

```ts
// app.module.ts
import { TransactionalModule } from '@nestjs-transactions/prisma';

@Module({
  imports: [
    PrismaModule, // exports your PrismaService (extends PrismaClient)
    TransactionalModule.forRoot({
      prismaToken: PrismaService,
      sqlFlavor: 'postgresql', // enables Propagation.NESTED (savepoints)
      imports: [PrismaModule],
    }),
  ],
})
export class AppModule {}
```

Unlike the TypeORM adapter there is **no `forFeature`** — one `forRoot()` is the whole setup. Then inject the transaction-aware client anywhere:

```ts
// user.service.ts
import { InjectPrismaClient, Transactional } from '@nestjs-transactions/prisma';
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
    await this.audit.record(user.id); // joins the SAME transaction
    return user;
  }
}
```

If `signUp` throws, everything rolls back — including writes made in `AuditService`. Outside a transaction the injected client behaves like the plain base client.

## Features

- **Propagation** — `REQUIRED`, `REQUIRES_NEW`, `NESTED` (needs `sqlFlavor`), `MANDATORY`, `NEVER`, `SUPPORTS`, `NOT_SUPPORTED`.
- **Transaction options** — Prisma's native `timeout`, `maxWait`, `isolationLevel`, per-call or as defaults.
- **Multiple connections** — a named `forRoot()` per client.
- **Transaction hooks** — `runOnTransactionCommit` / `Rollback` / `Complete`.
- **Programmatic control** — `TransactionHost`, or the raw client via `@InjectTransaction()`.
- **Prisma 7 / driver adapters** — works unchanged; the API is generic over your client type.
- **Testing** — a no-op module for unit tests without a database.

See the **[full documentation](https://jubaerhosain.github.io/nestjs-transactions/docs/prisma)** for details on all of the above, plus caveats.

## License

MIT
