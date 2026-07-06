import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { createNoOpTransactionalModule } from '../src/testing';

@Injectable()
class Service {
  constructor(readonly txHost: TransactionHost) {}

  @Transactional()
  async doWork(): Promise<string> {
    return 'done';
  }
}

describe('createNoOpTransactionalModule', () => {
  it('boots with no arguments and satisfies @Transactional()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule()],
      providers: [Service],
    }).compile();

    await expect(moduleRef.get(Service).doWork()).resolves.toBe('done');
    await moduleRef.close();
  });

  it('exposes the provided tx via TransactionHost', async () => {
    const tx = { marker: 'mock' };
    const moduleRef = await Test.createTestingModule({
      imports: [createNoOpTransactionalModule({ tx })],
      providers: [Service],
    }).compile();

    expect(moduleRef.get(Service).txHost.tx).toBe(tx);
    await moduleRef.close();
  });
});
