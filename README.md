# nestjs-transactions

**Silent transaction propagation for NestJS with vanilla ergonomics.** Keep `@InjectRepository(Entity)`, add `@Transactional()`, done — transactions propagate through CLS (`AsyncLocalStorage`), across services, with zero monkey-patching.

```ts
@Injectable()
export class MemberService {
  constructor(@InjectRepository(Member) private readonly repo: Repository<Member>) {}

  @Transactional()
  async transfer(from: string, to: string) {
    await this.repo.save(/* ... */); // silently runs on the transactional EntityManager
    await this.accounting.record(); // same transaction, propagated through CLS
  }
}
```

## Why

Transaction management shouldn't leak into your code. You keep your `@InjectRepository(Entity)` repositories, add `@Transactional()` to a method, and the repository quietly runs on the active transaction — no `EntityManager` or `queryRunner` threaded through your services, no boilerplate.

- **Invisible propagation.** Transactions flow through CLS (`AsyncLocalStorage`), so a call several services deep joins the same transaction and rolls back together.
- **Plain dependency injection.** It's built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional) — TypeORM's classes are never patched at startup, so a library upgrade can't silently break you.
- **Familiar ergonomics.** Inspired by a decorator-based approach many NestJS developers already know, but that is no longer maintained.

## Packages

| Package                                              | Use it for                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@nestjs-transactions/typeorm`](./packages/typeorm) | TypeORM — silent `@InjectRepository` repositories                                          |
| [`@nestjs-transactions/core`](./packages/core)       | ORM-agnostic building blocks (installed automatically as a peer; you don't import from it) |

Every adapter exposes the same surface — `TransactionalModule`, `Transactional`, `Propagation`, `TransactionHost`, and the `runOnTransactionCommit`/`Rollback`/`Complete` lifecycle hooks — from a single import.

## Quick start (TypeORM)

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

```ts
// app.module.ts
import { TransactionalModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [TypeOrmModule.forRoot({/* ... */}), TransactionalModule.forRoot()],
})
export class AppModule {}

// member.module.ts — replaces TypeOrmModule.forFeature([Member])
@Module({
  imports: [TransactionalModule.forFeature([Member])],
  providers: [MemberService],
})
export class MemberModule {}
```

That's the whole setup. See the [`@nestjs-transactions/typeorm` README](./packages/typeorm/README.md) for propagation modes, multiple data sources, custom repositories, and testing utilities.

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test:unit
docker compose up -d --wait   # two Postgres containers on ports 54321/54322
pnpm -r test:int
```

## License

MIT
