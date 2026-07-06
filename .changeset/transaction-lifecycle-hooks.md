---
"@nestjs-transactions/core": minor
"@nestjs-transactions/typeorm": minor
---

Add transaction lifecycle hooks (`runOnTransactionCommit`,
`runOnTransactionRollback`, `runOnTransactionComplete`) — a port of the
`typeorm-transactional` API. Call them inside a `@Transactional()` method to
register callbacks that run after the transaction commits, rolls back, or
completes. Built on CLS with no monkey-patching; async callbacks are awaited
sequentially and a throwing callback is caught and logged.
