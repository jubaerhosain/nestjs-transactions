# nestjs-transactions

[![CI](https://img.shields.io/github/actions/workflow/status/jubaerhosain/nestjs-transactions/ci.yml?branch=main&label=CI)](https://github.com/jubaerhosain/nestjs-transactions/actions/workflows/ci.yml)
[![npm (typeorm)](https://img.shields.io/npm/v/%40nestjs-transactions%2Ftypeorm?label=%40nestjs-transactions%2Ftypeorm)](https://www.npmjs.com/package/@nestjs-transactions/typeorm)
[![npm (prisma)](https://img.shields.io/npm/v/%40nestjs-transactions%2Fprisma?label=%40nestjs-transactions%2Fprisma)](https://www.npmjs.com/package/@nestjs-transactions/prisma)
[![license](https://img.shields.io/npm/l/%40nestjs-transactions%2Ftypeorm)](./LICENSE)

**Declarative transaction propagation for NestJS with vanilla ergonomics.** Keep `@InjectRepository(Entity)`, add `@Transactional()`, done — transactions propagate through CLS (`AsyncLocalStorage`), across services, with zero monkey-patching.

📖 **Documentation: [jubaerhosain.github.io/nestjs-transactions](https://jubaerhosain.github.io/nestjs-transactions/)**

```ts
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

## Why

Transaction management shouldn't leak into your code. You keep your `@InjectRepository(Entity)` repositories, add `@Transactional()` to a method, and the repository quietly runs on the active transaction — no `EntityManager` or `queryRunner` threaded through your services, no boilerplate.

- **Invisible propagation.** Transactions flow through CLS (`AsyncLocalStorage`), so a call several services deep joins the same transaction and rolls back together.
- **Plain dependency injection.** It's built on the actively maintained [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional) — TypeORM's classes are never patched at startup, so a library upgrade can't break you unexpectedly.
- **Familiar ergonomics.** Inspired by [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) — a decorator-based approach many NestJS developers already know, but that is no longer maintained.

## Packages

| Package                                              | Use it for                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`@nestjs-transactions/typeorm`](./packages/typeorm) | TypeORM — transaction-aware `@InjectRepository` repositories                               |
| [`@nestjs-transactions/prisma`](./packages/prisma)   | Prisma — one transaction-aware client via `@InjectPrismaClient`                            |
| [`@nestjs-transactions/core`](./packages/core)       | ORM-agnostic building blocks (installed automatically as a peer; you don't import from it) |

Every adapter exposes the same transactional surface — `Transactional`, `Propagation`, `TransactionHost`, and the `runOnTransactionCommit`/`Rollback`/`Complete` lifecycle hooks — from a single import. The TypeORM adapter's module is `NestjsTypeormModule`, a unified module that owns both the DataSource and transactions (use it instead of `@nestjs/typeorm`'s `TypeOrmModule`); the Prisma adapter's is `TransactionalModule`.

## Quick start (TypeORM)

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs/typeorm typeorm @nestjs-cls/transactional \
  @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

```ts
// app.module.ts — NestjsTypeormModule from THIS package, not @nestjs/typeorm
import { NestjsTypeormModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [NestjsTypeormModule.forRoot({/* all @nestjs/typeorm options ... */})],
})
export class AppModule {}

// member.module.ts — same shape as @nestjs/typeorm's forFeature
@Module({
  imports: [NestjsTypeormModule.forFeature([Member])],
  providers: [MemberService],
})
export class MemberModule {}
```

That's the whole setup. See the [documentation site](https://jubaerhosain.github.io/nestjs-transactions/) for propagation modes, multiple data sources, custom repositories, and testing utilities — for both the [TypeORM](https://jubaerhosain.github.io/nestjs-transactions/docs/typeorm) and [Prisma](https://jubaerhosain.github.io/nestjs-transactions/docs/prisma) adapters.

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
