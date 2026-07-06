---
'@nestjs-transactions/typeorm': major
---

**Breaking:** `@Transactional` now takes a single options object instead of positional arguments, matching `typeorm-transactional`'s ergonomics.

```ts
// before (positional)
@Transactional(Propagation.REQUIRES_NEW)
@Transactional('stats')
@Transactional('stats', Propagation.NESTED, { isolationLevel: IsolationLevel.SERIALIZABLE })

// after (object)
@Transactional({ propagation: Propagation.REQUIRES_NEW })
@Transactional({ connectionName: 'stats' })
@Transactional({ connectionName: 'stats', propagation: Propagation.NESTED, isolationLevel: IsolationLevel.SERIALIZABLE })
```

`@Transactional()` (no arguments) is unchanged, and calls that already passed an options object (e.g. `@Transactional({ isolationLevel })`) keep working.

Behavior is identical — the decorator still delegates to `@nestjs-cls/transactional` (no monkey-patching). The object form is also more robust: `connectionName` and `propagation` are separate keys, so a connection named like a propagation literal (e.g. `"REQUIRED"`) can no longer be misinterpreted.

The `@nestjs-transactions/core` `Transactional` export is unchanged (still the positional `@nestjs-cls` decorator) for adapter authors.

Also fixes connection resolution so an explicit `connectionName: 'default'` (and the string `'default'` form) now maps to the default connection — matching how `dataSource: 'default'` already behaves — instead of wiring repositories to a never-registered `'default'`-named `TransactionHost`. The `@Transactional` decorator applies the same normalization, so `@Transactional({ connectionName: 'default' })` targets the default connection instead of throwing "TransactionHost not initialized".
