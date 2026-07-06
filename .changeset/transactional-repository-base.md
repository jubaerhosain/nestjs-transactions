---
'@nestjs-transactions/typeorm': major
---

**Breaking:** the custom-repository base class `TransactionAwareRepository` is renamed to `TransactionalRepository`, and it now receives the entity and `TransactionHost` through the constructor instead of an abstract `entity` field.

```ts
// before
import { TransactionAwareRepository } from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberRepository extends TransactionAwareRepository<Member> {
  protected readonly entity = Member;

  findByEmail(email: string) {
    return this.repo.findOneBy({ email });
  }
}

// after
import { TransactionalRepository, TransactionHost, TypeOrmAdapter } from '@nestjs-transactions/typeorm';

@Injectable()
export class MemberRepository extends TransactionalRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  findByEmail(email: string) {
    return this.repo.findOneBy({ email });
  }
}
```

`this.repo` / `this.manager` behave exactly as before — they always reflect the current transactional `EntityManager`. The constructor form makes user-defined base repositories plain generic subclasses (no mixin factories) that can also inject extra request context (e.g. `ClsService`) and pass it up via `super(...)`.

**New (non-breaking):** `TypeOrmAdapter` — a concise re-export alias for `TransactionalAdapterTypeOrm`, for use in type positions like `TransactionHost<TypeOrmAdapter>`. The original `TransactionalAdapterTypeOrm` export is unchanged.
