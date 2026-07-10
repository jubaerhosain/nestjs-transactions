import { Injectable, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectTransaction, Propagation } from '@nestjs-transactions/core';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { FakePrismaClient, FakePrismaModule } from './fake-client';

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

describe('TransactionalModule.forRoot — coexisting connections', () => {
  class AnalyticsPrismaClient extends FakePrismaClient {
    override marker = 'analytics-base';
    override txClient = { marker: 'analytics-tx' };
  }

  @Module({ providers: [AnalyticsPrismaClient], exports: [AnalyticsPrismaClient] })
  class AnalyticsPrismaModule {}

  @Injectable()
  class TwoConnectionService {
    constructor(
      @InjectPrismaClient() private readonly prisma: any,
      @InjectPrismaClient('analytics') private readonly analytics: any,
    ) {}

    @Transactional()
    async defaultTx(): Promise<[string, string]> {
      return [this.prisma.marker, this.analytics.marker];
    }

    @Transactional({ connectionName: 'analytics' })
    async analyticsTx(): Promise<[string, string]> {
      return [this.prisma.marker, this.analytics.marker];
    }
  }

  it('each connection opens transactions on its own client only', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot({
          prismaToken: FakePrismaClient,
          imports: [FakePrismaModule],
        }),
        TransactionalModule.forRoot({
          prismaToken: AnalyticsPrismaClient,
          imports: [AnalyticsPrismaModule],
          connectionName: 'analytics',
        }),
      ],
      providers: [TwoConnectionService],
    }).compile();
    const service = moduleRef.get(TwoConnectionService);
    const prisma = moduleRef.get(FakePrismaClient);
    const analytics = moduleRef.get(AnalyticsPrismaClient);

    // A default-connection transaction leaves the analytics client untouched…
    await expect(service.defaultTx()).resolves.toEqual(['tx', 'analytics-base']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(analytics.$transaction).not.toHaveBeenCalled();

    // …and vice versa.
    await expect(service.analyticsTx()).resolves.toEqual(['base', 'analytics-tx']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(analytics.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('TransactionalModule.forRoot — enableTransactionProxy', () => {
  @Injectable()
  class ProxyService {
    constructor(@InjectTransaction() private readonly tx: any) {}

    @Transactional()
    async markerInTx(): Promise<string> {
      return this.tx.marker;
    }
  }

  it('@InjectTransaction() resolves the active transaction client', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot({
          prismaToken: FakePrismaClient,
          imports: [FakePrismaModule],
          enableTransactionProxy: true,
        }),
      ],
      providers: [ProxyService],
    }).compile();

    await expect(moduleRef.get(ProxyService).markerInTx()).resolves.toBe('tx');
  });
});

describe('TransactionalModule.forRoot — REQUIRES_NEW', () => {
  @Injectable()
  class RequiresNewService {
    constructor(@InjectPrismaClient() private readonly prisma: any) {}

    @Transactional({ propagation: Propagation.REQUIRES_NEW })
    async inner(): Promise<string> {
      return this.prisma.marker;
    }

    @Transactional()
    async outer(): Promise<string> {
      return this.inner();
    }
  }

  it('opens a second $transaction on the base client while the outer is active', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot({ prismaToken: FakePrismaClient, imports: [FakePrismaModule] }),
      ],
      providers: [RequiresNewService],
    }).compile();
    const prisma = moduleRef.get(FakePrismaClient);

    await expect(moduleRef.get(RequiresNewService).outer()).resolves.toBe('tx');
    // Prisma has no nested interactive transactions: the adapter always calls
    // $transaction on the base client, so REQUIRES_NEW means two top-level calls.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
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
