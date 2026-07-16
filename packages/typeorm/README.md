# @nestjs-transactions/typeorm

**Declarative `@Transactional()` for NestJS + TypeORM.** Keep `@InjectRepository(Entity)`, add one decorator — transactions propagate through CLS (`AsyncLocalStorage`) across services. Standard NestJS dependency injection built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional): **no monkey-patching**. Inspired by [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) — a decorator-based approach many NestJS developers already know, but that is no longer maintained.

📖 **[Full documentation → jubaerhosain.github.io/nestjs-transactions/docs/typeorm](https://jubaerhosain.github.io/nestjs-transactions/docs/typeorm)**

## Install

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

(All are peer dependencies — this package ships zero runtime dependencies.)

## Quick start

```ts
// app.module.ts — TypeOrmModule owns the connection, TransactionalModule owns propagation
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionalModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [TypeOrmModule.forRoot({/* ... */}), TransactionalModule.forRoot()],
})
export class AppModule {}

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
- **Custom repositories** — the `TransactionalRepository` base class.
- **Testing** — a no-op module for unit tests without a database.
- **Migration** — a drop-in path from `typeorm-transactional`.

See the **[full documentation](https://jubaerhosain.github.io/nestjs-transactions/docs/typeorm)** for details on all of the above, plus caveats.

## License

MIT
