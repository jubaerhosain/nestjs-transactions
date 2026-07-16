---
id: custom-repositories
title: Custom repositories with TransactionalRepository (TypeORM)
description: Write transaction-aware custom TypeORM repositories in NestJS by extending TransactionalRepository instead of using repo.extend().
sidebar_label: Custom repositories
---

# Custom repositories

`repo.extend()` and hand-rolled repository classes hold a fixed `EntityManager`
and can't be intercepted. Extend the base class instead:

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

Share behaviour across repositories with your own generic base — a plain abstract
subclass, no factories, that can also pull in extra request context and pass it up
via `super(...)`:

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

Use `this.repo` (a transaction-aware `Repository`) or `this.manager` (the current
`EntityManager`) inside your methods.
