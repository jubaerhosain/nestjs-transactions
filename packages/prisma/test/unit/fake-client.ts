import { Module } from '@nestjs/common';

/**
 * Structurally satisfies the upstream adapter: `$transaction(fn, options)`
 * runs the callback with a distinguishable transaction client and resolves
 * with its result, like Prisma's interactive transaction.
 */
export class FakePrismaClient {
  marker = 'base';
  txClient = { marker: 'tx' };
  $transaction = jest.fn(async (fn: (tx: any) => Promise<any>) => fn(this.txClient));
}

@Module({ providers: [FakePrismaClient], exports: [FakePrismaClient] })
export class FakePrismaModule {}
