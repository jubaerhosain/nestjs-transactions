---
title: Multiple data sources (TypeORM)
description: Use nestjs-transactions with multiple TypeORM data sources — name connections and target them per @Transactional() call.
sidebar_label: Multiple data sources
---

# Multiple data sources

`name` names both the `DataSource` and the transactional connection — one
`forRoot()` per data source:

```ts
NestjsTypeormModule.forRoot(mainDbConfig),                        // default DataSource
NestjsTypeormModule.forRoot({ ...statsDbConfig, name: 'stats' }), // the 'stats' DataSource

NestjsTypeormModule.forFeature([Member]),
NestjsTypeormModule.forFeature([Stat], 'stats'),
```

```ts
@Transactional({ connectionName: 'stats' })
async recordStats() {
  /* wraps only the stats DataSource */
}
```

For `forFeature`, the string form and the single-key object forms
`{ connectionName: 'stats' }` / `{ dataSource: 'stats' }` are all equivalent —
each side defaults to the other. The unified module always names the
transactional connection after the `DataSource` (`forRoot({ name })` sets
both), so a **split** `{ connectionName, dataSource }` whose two names differ
is not supported here — `forFeature` rejects it at startup with a guided error.
That combination only applies to advanced hand-wired setups built on
`provideTransactionAwareRepository`.
