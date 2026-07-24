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
import { TransactionalRepository } from '../../src/transactional.repository';
import { Member, PG_A } from './fixtures';

@Injectable()
class MemberRepository extends TransactionalRepository<Member> {
  constructor(txHost: TransactionHost<TypeOrmAdapter>) {
    super(Member, txHost);
  }

  findByName(name: string): Promise<Member | null> {
    return this.repo.findOneBy({ name });
  }

  async createAndFail(name: string): Promise<void> {
    await this.repo.save({ name });
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

  it('custom repositories via TransactionalRepository join the transaction', async () => {
    await expect(service.createViaCustomRepoAndFail('m1')).rejects.toThrow('custom repo boom');
    await expect(service.repo.count()).resolves.toBe(0);

    await service.repo.save({ name: 'm2' });
    await expect(service.customRepo.findByName('m2')).resolves.toMatchObject({ name: 'm2' });
  });
});
