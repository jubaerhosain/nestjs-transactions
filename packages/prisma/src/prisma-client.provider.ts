import { Inject, Provider } from '@nestjs/common';
import {
  createTransactionAwareProxy,
  getTransactionHostToken,
  TransactionHost,
} from '@nestjs-transactions/core';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { normalizeName } from './normalize-name';

const PRISMA_CLIENT_TOKEN = 'TRANSACTIONAL_PRISMA_CLIENT';

/**
 * The DI token the transaction-aware Prisma client is provided under. Prefer
 * `@InjectPrismaClient()`; use this directly for manual resolution
 * (`moduleRef.get(...)`) or custom providers.
 */
export function getPrismaClientToken(connectionName?: string): string {
  const name = normalizeName(connectionName);
  return name === undefined ? PRISMA_CLIENT_TOKEN : `${PRISMA_CLIENT_TOKEN}_${name}`;
}

/**
 * Inject the transaction-aware Prisma client: inside `@Transactional()` every
 * call runs on the active transaction client, outside it on the base client.
 * Annotate the parameter with your client's transaction type, e.g.
 * `PrismaTransactionalClient<MyClient>` (or `Prisma.TransactionClient`).
 */
export function InjectPrismaClient(
  connectionName?: string,
): ParameterDecorator & PropertyDecorator {
  return Inject(getPrismaClientToken(connectionName));
}

/**
 * A provider registered under {@link getPrismaClientToken} whose value
 * delegates every property access to the *current* Prisma client: the
 * transactional one inside `@Transactional()`, the base one outside.
 */
export function provideTransactionAwarePrismaClient(connectionName?: string): Provider {
  const name = normalizeName(connectionName);
  return {
    provide: getPrismaClientToken(name),
    inject: [getTransactionHostToken(name)],
    useFactory: (txHost: TransactionHost<TransactionalAdapterPrisma>) =>
      createTransactionAwareProxy(() => txHost.tx),
  };
}
