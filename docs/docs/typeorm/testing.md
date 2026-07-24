---
id: testing
title: Unit testing (TypeORM)
description: Unit-test @Transactional() NestJS services without a database using createNoOpTypeOrmTransactionalModule.
sidebar_label: Testing
---

# Testing

Use the no-op testing module so `@Transactional()` methods run without real
transactions and `@InjectRepository(Member)` resolves to your mock:

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

`createNoOpTypeOrmTransactionalModule` is a unit-test replacement for
`forRoot()` + `forFeature()`: `@Transactional()` no-ops and `@InjectRepository`
resolves proxies over your mocked `manager.getRepository()` — no `DataSource`
is created.

To unit-test a
[`NestjsTypeormRepository`](./custom-repositories.md) subclass this way,
remember its inherited methods call the **manager** directly
(`manager.find(Member, ...)`, `manager.save(Member, ...)`) and `this.metadata`
reads `manager.connection.getMetadata(...)` — so either give the mock `manager`
those methods, or simply override the subclass provider with a mock in the
testing module.
