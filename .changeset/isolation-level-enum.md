---
'@nestjs-transactions/typeorm': minor
---

Add an `IsolationLevel` enum so transaction isolation can be set with a typed, autocompletable
value instead of a raw string: `@Transactional<TransactionalAdapterTypeOrm>({ isolationLevel: IsolationLevel.SERIALIZABLE })`.
Its members map to TypeORM's isolation-level literals, so existing string usage keeps working.
