---
'@nestjs-transactions/typeorm': major
---

**Breaking:** `TransactionalRepository` is renamed to `NestjsTypeormRepository` and now **extends TypeORM's `Repository<Entity>`**.

- Subclasses call the full `Repository` API directly — `this.find()`, `this.save()`, `this.createQueryBuilder()`, … — and every inherited method runs on the current transaction's `EntityManager` inside `@Transactional()` (base manager outside).
- The `this.repo` getter is removed: replace `this.repo.x()` with `this.x()`. `this.manager` (now the live, transaction-aware manager) and `this.txHost` remain. The constructor signature is unchanged (`super(Entity, txHost)`).
- `.extend({ ... })` on subclass instances is now supported and stays transaction-aware (TypeORM's own implementation is overridden — it would pin the manager and mis-invoke the subclass constructor).
- Tree entities: `TreeRepository` methods are not inherited — use `this.manager.getTreeRepository(this.target)` or `@InjectRepository`.
