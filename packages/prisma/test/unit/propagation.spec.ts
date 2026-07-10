import { Injectable, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Propagation,
  TransactionAlreadyActiveError,
  TransactionNotActiveError,
} from '@nestjs-transactions/core';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { FakePrismaClient, FakePrismaModule } from './fake-client';

@Injectable()
class PropagationService {
  constructor(@InjectPrismaClient() private readonly prisma: any) {}

  @Transactional({ propagation: Propagation.MANDATORY })
  async mandatory(): Promise<string> {
    return this.prisma.marker;
  }

  @Transactional({ propagation: Propagation.NEVER })
  async never(): Promise<string> {
    return this.prisma.marker;
  }

  @Transactional({ propagation: Propagation.SUPPORTS })
  async supports(): Promise<string> {
    return this.prisma.marker;
  }

  @Transactional({ propagation: Propagation.NESTED })
  async nested(): Promise<string> {
    return this.prisma.marker;
  }

  @Transactional()
  async requiredCalling(inner: () => Promise<string>): Promise<string> {
    return inner();
  }
}

describe('propagation modes (fake client)', () => {
  let moduleRef: TestingModule;
  let service: PropagationService;
  let prisma: FakePrismaClient;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        // No sqlFlavor on purpose: the NESTED tests below pin the
        // adapter-does-not-support-savepoints fallback.
        TransactionalModule.forRoot({ prismaToken: FakePrismaClient, imports: [FakePrismaModule] }),
      ],
      providers: [PropagationService],
    }).compile();
    service = moduleRef.get(PropagationService);
    prisma = moduleRef.get(FakePrismaClient);
  });

  describe('MANDATORY', () => {
    it('throws TransactionNotActiveError outside a transaction', async () => {
      // Async wrapper: the propagation check throws synchronously (before the
      // decorated method's promise exists), so a bare call would throw here.
      await expect(async () => service.mandatory()).rejects.toThrow(TransactionNotActiveError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('joins the outer transaction without opening a second one', async () => {
      await expect(service.requiredCalling(() => service.mandatory())).resolves.toBe('tx');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('NEVER', () => {
    it('throws TransactionAlreadyActiveError inside a transaction', async () => {
      await expect(service.requiredCalling(() => service.never())).rejects.toThrow(
        TransactionAlreadyActiveError,
      );
    });

    it('runs on the base client outside a transaction, opening none', async () => {
      await expect(service.never()).resolves.toBe('base');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('SUPPORTS', () => {
    it('runs without a transaction when none is active', async () => {
      await expect(service.supports()).resolves.toBe('base');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('joins the active transaction', async () => {
      await expect(service.requiredCalling(() => service.supports())).resolves.toBe('tx');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('NESTED without sqlFlavor (adapter has no savepoint support)', () => {
    it('outside a transaction: opens a regular transaction', async () => {
      await expect(service.nested()).resolves.toBe('tx');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('inside a transaction: warns and opens an INDEPENDENT transaction (REQUIRES_NEW-like)', async () => {
      // Pin the upstream fallback (`runInNestedTransaction` → `runWithTransaction`):
      // without savepoint support the "nested" block is NOT joined to the outer
      // transaction — it commits/rolls back on its own. Surprising enough that
      // this test exists to fail loudly if the behavior ever changes.
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        await expect(service.requiredCalling(() => service.nested())).resolves.toBe('tx');
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('Nested Propagation option is ignored'),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });
});
