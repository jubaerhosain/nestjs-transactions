import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InjectTransactionHost,
  Transactional,
  TransactionalAdapterTypeOrm,
  TransactionalModule,
  TransactionHost,
} from '../../src';
import { Member, PG_A, PG_B, Stat } from './fixtures';

@Injectable()
class ReportingService {
  constructor(
    @InjectRepository(Member) readonly members: Repository<Member>,
    @InjectRepository(Stat, 'stats') readonly stats: Repository<Stat>,
    readonly defaultTxHost: TransactionHost<TransactionalAdapterTypeOrm>,
    @InjectTransactionHost('stats')
    readonly statsTxHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  @Transactional('stats')
  async recordAndFail(label: string): Promise<void> {
    await this.stats.save({ label });
    throw new Error('stats boom');
  }

  @Transactional('stats')
  async recordStatAndWriteMember(label: string, name: string): Promise<void> {
    await this.stats.save({ label });
    // Member write happens on the DEFAULT connection — outside the stats transaction.
    await this.members.save({ name });
    throw new Error('stats boom');
  }
}

describe('multiple data sources (real Postgres, two databases)', () => {
  let moduleRef: TestingModule;
  let service: ReportingService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(PG_A),
        TypeOrmModule.forRoot({ ...PG_B, name: 'stats' }),
        TransactionalModule.forRoot(),
        TransactionalModule.forRoot({ connectionName: 'stats' }),
        TransactionalModule.forFeature([Member]),
        TransactionalModule.forFeature([Stat], 'stats'),
      ],
      providers: [ReportingService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(ReportingService);
  });

  beforeEach(async () => {
    await service.members.clear();
    await service.stats.clear();
  });
  afterAll(() => moduleRef.close());

  it('gives each connection its own TransactionHost', () => {
    expect(service.defaultTxHost).not.toBe(service.statsTxHost);
  });

  it('rolls back the named connection independently', async () => {
    await expect(service.recordAndFail('s1')).rejects.toThrow('stats boom');
    await expect(service.stats.count()).resolves.toBe(0);
  });

  it("a named transaction's rollback does not touch the other connection", async () => {
    await expect(service.recordStatAndWriteMember('s1', 'm1')).rejects.toThrow('stats boom');

    // stats write rolled back; member write was auto-committed on the default connection
    await expect(service.stats.count()).resolves.toBe(0);
    await expect(service.members.count()).resolves.toBe(1);
  });

  it('repositories resolve against their own data source', async () => {
    await service.members.save({ name: 'm' });
    await service.stats.save({ label: 's' });
    await expect(service.members.count()).resolves.toBe(1);
    await expect(service.stats.count()).resolves.toBe(1);
  });
});

// Regression for the review finding: { dataSource: 'stats' } used to bind the
// stats repository to the DEFAULT connection's manager (silent wrong database).
describe('forFeature/forRoot with dataSource-only options (real Postgres)', () => {
  @Injectable()
  class StatsService {
    constructor(@InjectRepository(Stat, 'stats') readonly stats: Repository<Stat>) {}

    @Transactional('stats')
    async recordAndFail(label: string): Promise<void> {
      await this.stats.save({ label });
      throw new Error('stats boom');
    }
  }

  let moduleRef: TestingModule;
  let service: StatsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...PG_B, name: 'stats' }),
        TransactionalModule.forRoot({ dataSource: 'stats' }),
        TransactionalModule.forFeature([Stat], { dataSource: 'stats' }),
      ],
      providers: [StatsService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(StatsService);
    await service.stats.clear();
  });

  afterAll(() => moduleRef.close());

  it("registers the 'stats' connection so @Transactional('stats') wraps the stats DB", async () => {
    await expect(service.recordAndFail('s1')).rejects.toThrow('stats boom');
    await expect(service.stats.count()).resolves.toBe(0); // rolled back on the stats DB
  });
});
