import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as coreTesting from '@nestjs-transactions/core/testing';
import { Repository } from 'typeorm';
import { Transactional, TransactionHost } from '../../src';
import {
  createNoOpTransactionalModule,
  createNoOpTypeOrmTransactionalModule,
  NoOpTransactionalAdapter,
} from '../../src/testing';

class Member {}

@Injectable()
class MemberService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    readonly txHost: TransactionHost,
  ) {}

  @Transactional()
  async register(name: string): Promise<unknown> {
    return this.repo.save({ name });
  }
}

describe('createNoOpTypeOrmTransactionalModule', () => {
  it('satisfies @Transactional and @InjectRepository with a mocked manager', async () => {
    const repoMock = { save: jest.fn().mockResolvedValue({ id: 1, name: 'jubaer' }) };
    const manager = { getRepository: jest.fn(() => repoMock) };

    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTypeOrmTransactionalModule({ manager, entities: [Member] })],
      providers: [MemberService],
    }).compile();
    const service = moduleRef.get(MemberService);

    await expect(service.register('jubaer')).resolves.toEqual({ id: 1, name: 'jubaer' });
    expect(repoMock.save).toHaveBeenCalledWith({ name: 'jubaer' });
    expect(manager.getRepository).toHaveBeenCalledWith(Member);

    await moduleRef.close();
  });

  it('registers no repository providers when entities is omitted', () => {
    const manager = { getRepository: jest.fn() };

    const dynamicModule = createNoOpTypeOrmTransactionalModule({ manager });

    expect(dynamicModule.providers).toEqual([]);
    expect(dynamicModule.exports).toEqual([]);
    expect(dynamicModule.imports).toHaveLength(1);
  });

  it("re-exports core's testing helpers with the same identity", () => {
    expect(createNoOpTransactionalModule).toBe(coreTesting.createNoOpTransactionalModule);
    expect(NoOpTransactionalAdapter).toBe(coreTesting.NoOpTransactionalAdapter);
  });
});
