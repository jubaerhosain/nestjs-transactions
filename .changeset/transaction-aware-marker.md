---
'@nestjs-transactions/core': minor
---

New adapter-SPI export `TRANSACTION_AWARE` — a well-known symbol that every proxy created by `createTransactionAwareProxy` answers with `true`, **without resolving the proxy's target** (safe before the underlying connection exists). Lets adapters distinguish transaction-aware providers from plain ORM instances registered under the same DI token; used by `@nestjs-transactions/typeorm`'s new mixed-import runtime guard.
