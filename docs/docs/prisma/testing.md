---
id: testing
title: Unit testing (Prisma)
description: Unit-test @Transactional() NestJS services without a database using createNoOpPrismaTransactionalModule.
sidebar_label: Testing
---

# Unit testing

Use the no-op testing module so `@Transactional()` methods run without real
transactions and `@InjectPrismaClient()` resolves a proxy over your mock client:

```ts
import { createNoOpPrismaTransactionalModule } from '@nestjs-transactions/prisma/testing';

const mockClient = { user: { create: jest.fn() } };
const moduleRef = await Test.createTestingModule({
  imports: [createNoOpPrismaTransactionalModule({ client: mockClient })],
  providers: [UserService],
}).compile();
```

Transaction hooks still fire. Pass `connectionName` to stand in for a named
connection.
