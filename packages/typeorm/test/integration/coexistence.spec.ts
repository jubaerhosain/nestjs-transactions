import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';
import {
  InjectRepository,
  NestjsTypeormModule,
  Transactional,
  TransactionHost,
  TypeOrmAdapter,
} from '../../src';
import { NestjsTypeormRepository } from '../../src/nestjs-typeorm.repository';
import { Member, PG_A } from './fixtures';

@Injectable()
class MemberRepository extends NestjsTypeormRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  // Inherited Repository methods are called DIRECTLY on `this` — they must
  // run on the transactional EntityManager inside @Transactional().
  findByName(name: string): Promise<Member | null> {
    return this.findOneBy({ name });
  }

  countViaQueryBuilder(): Promise<number> {
    return this.createQueryBuilder('m').getCount();
  }

  async createAndFail(name: string): Promise<void> {
    await this.save({ name });
    throw new Error('custom repo boom');
  }
}

@Injectable()
class TenantService {
  constructor(
    @InjectRepository(Member) readonly repo: Repository<Member>,
    private readonly cls: ClsService,
    readonly customRepo: MemberRepository,
  ) {}

  @Transactional()
  async createForTenant(name: string): Promise<string | undefined> {
    await this.repo.save({ name });
    // Unrelated CLS state set by the host app must survive inside the transaction.
    return this.cls.get('tenant');
  }

  @Transactional()
  async createViaCustomRepoAndFail(name: string): Promise<void> {
    await this.customRepo.createAndFail(name);
  }

  // Saves via the inherited `save`, then reads the UNCOMMITTED row back through
  // an inherited finder and a query builder — both must see it (i.e. run on the
  // same open transaction) — then rolls everything back.
  @Transactional()
  async writeAndReadUncommitted(name: string): Promise<{ found: boolean; count: number }> {
    await this.customRepo.save({ name });
    const found = (await this.customRepo.findByName(name)) !== null;
    const count = await this.customRepo.countViaQueryBuilder();
    throw new UncommittedProbe({ found, count });
  }
}

/** Carries the mid-transaction observations out through the forced rollback. */
class UncommittedProbe extends Error {
  constructor(readonly seen: { found: boolean; count: number }) {
    super('probe rollback');
  }
}

describe('coexistence with a host app that owns ClsModule.forRoot (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: TenantService;
  let cls: ClsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({ global: true }),
        NestjsTypeormModule.forRoot(PG_A),
        NestjsTypeormModule.forFeature([Member]),
      ],
      providers: [TenantService, MemberRepository],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(TenantService);
    cls = moduleRef.get(ClsService);
  });

  beforeEach(() => service.repo.clear());
  afterAll(() => moduleRef.close());

  it('keeps host-app CLS state readable inside @Transactional()', async () => {
    const tenant = await cls.run(async () => {
      cls.set('tenant', 'acme');
      return service.createForTenant('m1');
    });

    expect(tenant).toBe('acme');
    await expect(service.repo.count()).resolves.toBe(1);
  });

  it('custom repositories via NestjsTypeormRepository join the transaction', async () => {
    await expect(service.createViaCustomRepoAndFail('m1')).rejects.toThrow('custom repo boom');
    await expect(service.repo.count()).resolves.toBe(0);

    await service.repo.save({ name: 'm2' });
    await expect(service.customRepo.findByName('m2')).resolves.toMatchObject({ name: 'm2' });
  });

  it('inherited finders and query builders see uncommitted writes of the open transaction', async () => {
    const probe = await service.writeAndReadUncommitted('m1').catch((e: unknown) => e);

    // Mid-transaction, both the inherited findOneBy and the query builder saw
    // the row this transaction had written but not committed...
    expect(probe).toMatchObject({ seen: { found: true, count: 1 } });
    // ...and the rollback then discarded it.
    await expect(service.repo.count()).resolves.toBe(0);
  });

  it('inherited methods work outside a transaction too (base manager fallback)', async () => {
    await service.customRepo.save({ name: 'm3' });
    await expect(service.customRepo.countViaQueryBuilder()).resolves.toBe(1);
    await expect(service.customRepo.findByName('m3')).resolves.toMatchObject({ name: 'm3' });
  });
});
