import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional, TransactionalModule } from '../../src';
import { Member, PG_A } from './fixtures';

@Injectable()
class IsolationProbe {
  constructor(@InjectRepository(Member) readonly repo: Repository<Member>) {}

  @Transactional()
  async currentIsolationLevel(): Promise<string> {
    const [{ transaction_isolation }] = await this.repo.query(
      "SELECT current_setting('transaction_isolation') AS transaction_isolation",
    );
    return transaction_isolation;
  }
}

async function bootWith(transactionalRoot: ReturnType<typeof TransactionalModule.forRoot>) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(PG_A),
      transactionalRoot,
      TransactionalModule.forFeature([Member]),
    ],
    providers: [IsolationProbe],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('forRoot options (real Postgres)', () => {
  let moduleRef: TestingModule;

  afterEach(() => moduleRef.close());

  it('applies defaultTxOptions from forRoot to every transaction', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRoot({ defaultTxOptions: { isolationLevel: 'SERIALIZABLE' } }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('serializable');
  });

  it('applies defaultTxOptions resolved asynchronously via forRootAsync', async () => {
    moduleRef = await bootWith(
      TransactionalModule.forRootAsync({
        useFactory: async () => ({ defaultTxOptions: { isolationLevel: 'REPEATABLE READ' } }),
      }),
    );
    const probe = moduleRef.get(IsolationProbe);
    await expect(probe.currentIsolationLevel()).resolves.toBe('repeatable read');
  });

  // Regression for the review finding: the shared adapter used to keep app A's
  // defaultTxOptions when app B's factory resolved none.
  it('does not leak async defaultTxOptions across app compiles of one module', async () => {
    let txOptions: object | undefined = { isolationLevel: 'SERIALIZABLE' };
    const sharedModule = TransactionalModule.forRootAsync({
      useFactory: async () => ({ defaultTxOptions: txOptions as any }),
    });

    moduleRef = await bootWith(sharedModule);
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'serializable',
    );
    await moduleRef.close();

    txOptions = undefined; // second app resolves NO defaults
    moduleRef = await bootWith(sharedModule);
    await expect(moduleRef.get(IsolationProbe).currentIsolationLevel()).resolves.toBe(
      'read committed', // Postgres default — NOT the stale serializable
    );
  });
});
