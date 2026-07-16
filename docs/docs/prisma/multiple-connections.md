---
id: multiple-connections
title: Multiple connections (Prisma)
description: Use nestjs-transactions with multiple Prisma clients — register a named forRoot per connection and target each per @Transactional() call.
sidebar_label: Multiple connections
---

# Multiple connections

Register one `forRoot()` per connection, naming all but the default with
`connectionName`:

```ts
TransactionalModule.forRoot({ prismaToken: PrismaService, sqlFlavor: 'postgresql', imports: [PrismaModule] }),
TransactionalModule.forRoot({
  prismaToken: AnalyticsPrismaService,
  sqlFlavor: 'postgresql',
  imports: [AnalyticsPrismaModule],
  connectionName: 'analytics',
}),
```

Inject the client for a given connection by name, and target it per call:

```ts
constructor(
  @InjectPrismaClient() private readonly prisma: Prisma.TransactionClient,
  @InjectPrismaClient('analytics') private readonly analytics: Prisma.TransactionClient,
) {}

@Transactional({ connectionName: 'analytics' })
async recordStats() {
  /* wraps only the 'analytics' connection */
}
```

Each connection's transactions (and hooks) run independently. The name
`'default'` is treated as the default connection.
