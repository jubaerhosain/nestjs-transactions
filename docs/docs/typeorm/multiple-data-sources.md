---
id: multiple-data-sources
title: Multiple data sources (TypeORM)
description: Use nestjs-transactions with multiple TypeORM data sources — name connections and target them per @Transactional() call.
sidebar_label: Multiple data sources
---

# Multiple data sources

Name the connection after the data source (the convention — both default to each
other):

```ts
TypeOrmModule.forRoot({ ...statsDbConfig, name: 'stats' }),
TransactionalModule.forRoot(),                            // default DataSource
TransactionalModule.forRoot({ connectionName: 'stats' }), // the 'stats' DataSource

TransactionalModule.forFeature([Member]),
TransactionalModule.forFeature([Stat], 'stats'),
```

```ts
@Transactional({ connectionName: 'stats' })
async recordStats() {
  /* wraps only the stats DataSource */
}
```

For `forFeature`, the object forms `{ connectionName: 'stats' }` and
`{ dataSource: 'stats' }` are equivalent to the string form — each side defaults
to the other. If the connection name must differ from the data source name, pass
both explicitly:

```ts
TransactionalModule.forFeature([Stat], { connectionName: 'stats', dataSource: 'statsDb' });
```
