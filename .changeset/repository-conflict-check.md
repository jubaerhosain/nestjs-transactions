---
'@nestjs-transactions/typeorm': minor
---

Runtime guard against the silent mixed-import mistake: if entity repositories are registered with `@nestjs/typeorm`'s `TypeOrmModule.forFeature` (or hand-rolled `Repository` providers) on a DataSource this package manages, they bypass `@Transactional()` — the app now **fails at boot** with a guided error naming the entities and connection, instead of silently losing rollback coverage. Configure per connection with the new `repositoryConflictCheck: 'error' | 'warn' | 'off'` option on `forRoot`/`forRootAsync` (default `'error'`; static in the async variant). Requires `@nestjs-transactions/core` >= 0.5.0 (peer range bumped).
