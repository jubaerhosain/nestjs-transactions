---
'@nestjs-transactions/typeorm': patch
---

docs: clarify that `TypeOrmModule.forRoot()` and `TransactionalModule.forRoot()`
are both required and why — one owns the connection, the other owns transaction
propagation. Also fix the missing `TypeOrmModule` import in the Quick start.
