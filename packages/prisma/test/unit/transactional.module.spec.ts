import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Propagation } from '@nestjs-transactions/core';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';

/**
 * Structurally satisfies the upstream adapter: `$transaction(fn, options)`
 * runs the callback with a distinguishable transaction client and resolves
 * with its result, like Prisma's interactive transaction.
 */
class FakePrismaClient {
  marker = 'base';
  txClient = { marker: 'tx' };
  $transaction = jest.fn(async (fn: (tx: any) => Promise<any>) => fn(this.txClient));
}

@Module({ providers: [FakePrismaClient], exports: [FakePrismaClient] })
class FakePrismaModule {}

@Injectable()
class SampleService {
  constructor(@InjectPrismaClient() private readonly prisma: any) {}

  currentMarker(): string {
    return this.prisma.marker;
  }

  @Transactional()
  async markerInTx(): Promise<string> {
    return this.prisma.marker;
  }

  @Transactional({ timeout: 30_000 })
  async withCallOptions(): Promise<void> {
    // Only the $transaction options matter here.
  }
}

async function compile(rootModule: any): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [rootModule],
    providers: [SampleService],
  }).compile();
}

describe('TransactionalModule.forRoot', () => {
  it('resolves the injected client to the transaction client inside @Transactional and the base client outside', async () => {
    const moduleRef = await compile(
      TransactionalModule.forRoot({ prismaToken: FakePrismaClient, imports: [FakePrismaModule] }),
    );
    const service = moduleRef.get(SampleService);
    const prisma = moduleRef.get(FakePrismaClient);

    expect(service.currentMarker()).toBe('base');
    await expect(service.markerInTx()).resolves.toBe('tx');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('merges defaultTxOptions into every transaction', async () => {
    const moduleRef = await compile(
      TransactionalModule.forRoot({
        prismaToken: FakePrismaClient,
        imports: [FakePrismaModule],
        defaultTxOptions: { timeout: 12_000 },
      }),
    );
    const service = moduleRef.get(SampleService);
    const prisma = moduleRef.get(FakePrismaClient);

    await service.markerInTx();
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 12_000 }),
    );

    await service.withCallOptions();
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it("treats connectionName 'default' as the default connection", async () => {
    const moduleRef = await compile(
      TransactionalModule.forRoot({
        prismaToken: FakePrismaClient,
        imports: [FakePrismaModule],
        connectionName: 'default',
      }),
    );

    await expect(moduleRef.get(SampleService).markerInTx()).resolves.toBe('tx');
  });
});

describe('TransactionalModule.forRoot — named connection', () => {
  @Injectable()
  class NamedService {
    constructor(@InjectPrismaClient('analytics') private readonly prisma: any) {}

    @Transactional({ connectionName: 'analytics', propagation: Propagation.REQUIRED })
    async markerInTx(): Promise<string> {
      return this.prisma.marker;
    }
  }

  it('wires the named client token to the named TransactionHost', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot({
          prismaToken: FakePrismaClient,
          imports: [FakePrismaModule],
          connectionName: 'analytics',
        }),
      ],
      providers: [NamedService],
    }).compile();

    await expect(moduleRef.get(NamedService).markerInTx()).resolves.toBe('tx');
    expect(moduleRef.get(FakePrismaClient).$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('TransactionalModule.forRootAsync', () => {
  it('resolves defaultTxOptions through DI', async () => {
    const OPTIONS_SOURCE = 'OPTIONS_SOURCE';

    @Module({
      providers: [{ provide: OPTIONS_SOURCE, useValue: { timeout: 7_000 } }],
      exports: [OPTIONS_SOURCE],
    })
    class ConfigLikeModule {}

    const moduleRef = await compile(
      TransactionalModule.forRootAsync({
        prismaToken: FakePrismaClient,
        imports: [FakePrismaModule, ConfigLikeModule],
        inject: [OPTIONS_SOURCE],
        useFactory: (options: { timeout: number }) => ({ defaultTxOptions: options }),
      }),
    );
    const service = moduleRef.get(SampleService);
    const prisma = moduleRef.get(FakePrismaClient);

    await expect(service.markerInTx()).resolves.toBe('tx');
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 7_000 }),
    );
  });
});
