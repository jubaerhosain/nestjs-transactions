import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { IsolationLevel } from '../../src/isolation-level';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { FakePrismaClient, FakePrismaModule } from './fake-client';

// Compile-time guard: every enum value must remain a valid Prisma isolation
// level. Prisma's union lives on the *generated* client, so this assertion
// lives in the tests (typecheck runs `prisma generate` first) rather than in
// `src/`, which never imports the generated client. If Prisma's literals ever
// drift from ours, `pnpm typecheck` fails here.
type _AssertInSync = `${IsolationLevel}` extends Prisma.TransactionIsolationLevel ? true : never;
const _assertInSync: _AssertInSync = true;
void _assertInSync;

describe('IsolationLevel', () => {
  it('exposes Prisma’s own isolation-level literals as enum values', () => {
    expect(IsolationLevel.READ_UNCOMMITTED).toBe('ReadUncommitted');
    expect(IsolationLevel.READ_COMMITTED).toBe('ReadCommitted');
    expect(IsolationLevel.REPEATABLE_READ).toBe('RepeatableRead');
    expect(IsolationLevel.SERIALIZABLE).toBe('Serializable');
  });

  it('is accepted by @Transactional and forwarded to $transaction', async () => {
    @Injectable()
    class ProbeService {
      constructor(@InjectPrismaClient() private readonly prisma: any) {}

      @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
      async run(): Promise<string> {
        return this.prisma.marker;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        TransactionalModule.forRoot({ prismaToken: FakePrismaClient, imports: [FakePrismaModule] }),
      ],
      providers: [ProbeService],
    }).compile();
    const prisma = moduleRef.get(FakePrismaClient);

    await expect(moduleRef.get(ProbeService).run()).resolves.toBe('tx');
    expect(prisma.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });
});
