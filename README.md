# nestjs-transactions

**Silent transaction propagation for NestJS with vanilla ergonomics.** Keep `@InjectRepository(Entity)`, add `@Transactional()`, done — transactions propagate through CLS (`AsyncLocalStorage`), across services, with zero monkey-patching.

```ts
@Injectable()
export class MemberService {
  constructor(@InjectRepository(Member) private readonly repo: Repository<Member>) {}

  @Transactional()
  async transfer(from: string, to: string) {
    await this.repo.save(/* ... */); // silently runs on the transactional EntityManager
    await this.accounting.record();  // same transaction, propagated through CLS
  }
}
```

## Why

- [`typeorm-transactional`](https://www.npmjs.com/package/typeorm-transactional) has the ergonomics but is **abandoned** (last release Oct 2023) and works by monkey-patching TypeORM prototypes at boot.
- [`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional) is actively maintained and correct — but requires injecting `TransactionHost` and writing `txHost.tx.getRepository(Entity)` everywhere; its docs state there is *no transactional support for working directly with repositories*.

This project bridges the gap: **the DX of the former, built entirely on the latter.** Standard NestJS DI, no patching, no boilerplate.

## Packages

| Package | Use it for |
|---|---|
| [`@nestjs-transactions/typeorm`](./packages/typeorm) | TypeORM — silent `@InjectRepository` repositories |
| [`@nestjs-transactions/core`](./packages/core) | ORM-agnostic building blocks (installed automatically as a peer; you don't import from it) |
| `@nestjs-transactions/prisma` | *planned* |
| `@nestjs-transactions/drizzle` | *planned* |

Every adapter exposes the same surface — `TransactionalModule`, `Transactional`, `Propagation`, `TransactionHost` — from a single import.

## Quick start (TypeORM)

```bash
npm install @nestjs-transactions/typeorm @nestjs-transactions/core \
  @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls
```

```ts
// app.module.ts
import { TransactionalModule } from '@nestjs-transactions/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({ /* ... */ }),
    TransactionalModule.forRoot(),
  ],
})
export class AppModule {}

// member.module.ts — replaces TypeOrmModule.forFeature([Member])
@Module({
  imports: [TransactionalModule.forFeature([Member])],
  providers: [MemberService],
})
export class MemberModule {}
```

That's the whole setup. See the [`@nestjs-transactions/typeorm` README](./packages/typeorm/README.md) for propagation modes, multiple data sources, custom repositories, testing utilities, and the migration guide from `typeorm-transactional`.

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
