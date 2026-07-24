---
title: Custom repositories with NestjsTypeormRepository (TypeORM)
description: Write transaction-aware custom TypeORM repositories in NestJS by extending NestjsTypeormRepository instead of using repo.extend().
sidebar_label: Custom repositories
---

# Custom repositories

Hand-rolled repository classes (and a plain repository's `.extend()`) hold a
fixed `EntityManager` and can't be intercepted. Extend `NestjsTypeormRepository`
instead — your class **is** a `Repository<Entity>`: every inherited method
(`this.find()`, `this.save()`, `this.createQueryBuilder()`, …) runs on the
current transaction's `EntityManager` inside `@Transactional()` and on the base
manager outside:

```ts
import {
  NestjsTypeormRepository,
  TransactionHost,
  TypeOrmAdapter,
} from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberRepository extends NestjsTypeormRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  findByEmail(email: string) {
    return this.findOneBy({ email }); // inherited — tracks the current transaction
  }
}
```

Share behaviour across repositories with your own generic base — a plain abstract
subclass, no factories, that can also pull in extra request context and pass it up
via `super(...)`:

```ts
export abstract class BaseRepository<E extends ObjectLiteral> extends NestjsTypeormRepository<E> {
  constructor(
    entity: EntityTarget<E>,
    txHost: TransactionHost<TypeOrmAdapter>,
    protected readonly cls: ClsService,
  ) {
    super(entity, txHost);
  }

  findAll(): Promise<E[]> {
    return this.find();
  }
}
```

For a named connection, inject the matching host with
`@InjectTransactionHost('stats')` and pass it up the same way.

## Notes

- Call the inherited `Repository` API directly on `this`; `this.manager` (the
  current `EntityManager`, a live accessor) and `this.txHost` are also
  available.
- `.extend({ ... })` **on a subclass instance** is supported and stays
  transaction-aware (the class overrides TypeORM's implementation, which would
  otherwise pin the manager).
- Tree entities: `TreeRepository`'s extra methods aren't inherited — call
  `this.manager.getTreeRepository(this.target)` inside a method (still
  transaction-aware), or inject with `@InjectRepository` (its provider resolves
  a `TreeRepository`).
- Don't re-declare `manager` (or `target`/`queryRunner`) as a field in a
  subclass — a class field would bury the live `manager` accessor the base
  installs.
