import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { runOnTransactionCommit } from '@nestjs-transactions/core';
import { InjectPrismaClient } from '../../src/prisma-client.provider';
import { Transactional } from '../../src/transactional';
import { createNoOpPrismaTransactionalModule } from '../../src/testing';

const committed: string[] = [];

@Injectable()
class AuthorService {
  constructor(@InjectPrismaClient() private readonly prisma: any) {}

  @Transactional()
  async create(name: string): Promise<{ id: number }> {
    runOnTransactionCommit(() => {
      committed.push(name);
    });
    return this.prisma.author.create({ data: { name } });
  }
}

describe('createNoOpPrismaTransactionalModule', () => {
  beforeEach(() => committed.splice(0));

  it('satisfies @Transactional() and @InjectPrismaClient() over a mock client', async () => {
    const client = { author: { create: jest.fn().mockResolvedValue({ id: 42 }) } };
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule({ client })],
      providers: [AuthorService],
    }).compile();

    await expect(moduleRef.get(AuthorService).create('ada')).resolves.toEqual({ id: 42 });
    expect(client.author.create).toHaveBeenCalledWith({ data: { name: 'ada' } });
    // Hooks are wired in the no-op module too, so commit callbacks stay testable.
    expect(committed).toEqual(['ada']);
  });

  it('boots without a client for services that only need @Transactional()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpPrismaTransactionalModule()],
      providers: [AuthorService],
    }).compile();

    expect(moduleRef.get(AuthorService)).toBeDefined();
  });
});
