import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { IsolationLevel } from '../../src/isolation-level';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { TransactionalModule } from '../../src/transactional.module';
import { FakePrismaClient, FakePrismaModule } from './fake-client';

// Compile-time guard: the enum and Prisma's isolation-level literals must stay
// in sync in BOTH directions. Prisma's union lives on the *generated* client,
// so these assertions live in the tests (typecheck runs `prisma generate`
// first) rather than in `src/`, which never imports the generated client. If
// the two ever drift, `pnpm typecheck` fails here.
//
// enum ⊆ Prisma: every IsolationLevel value is a valid Prisma literal (fails if
// Prisma renames or removes one we use).
type _AssertInSync = `${IsolationLevel}` extends Prisma.TransactionIsolationLevel ? true : never;
const _assertInSync: _AssertInSync = true;
void _assertInSync;

// Prisma ⊆ enum: every Prisma literal is exposed by IsolationLevel (fails if
// Prisma ADDS a level we haven't mirrored here).
type _AssertExhaustive = Prisma.TransactionIsolationLevel extends `${IsolationLevel}`
  ? true
  : never;
const _assertExhaustive: _AssertExhaustive = true;
void _assertExhaustive;

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
