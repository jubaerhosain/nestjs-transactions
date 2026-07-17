import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { InjectRepository, Transactional, TypeOrmModule } from '../../src';
import { Member, PG_A } from './fixtures';

@Injectable()
class MemberService {
  constructor(@InjectRepository(Member) readonly repo: Repository<Member>) {}

  @Transactional()
  async createAndFail(name: string): Promise<void> {
    await this.repo.save({ name });
    throw new Error('boom');
  }
}

// Proves two things at once:
// 1. `autoLoadEntities: true` picks up entities registered only through OUR
//    forFeature (the internally imported @nestjs/typeorm forFeature feeds
//    EntitiesMetadataStorage) — the DataSource has no `entities` of its own.
// 2. `@InjectRepository` resolves OUR transaction-aware provider, not the
//    plain one @nestjs/typeorm registers under the same token (provider
//    shadowing) — a plain repository would ignore the rollback.
describe('autoLoadEntities with the unified TypeOrmModule (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: MemberService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...PG_A, entities: [], autoLoadEntities: true }),
        TypeOrmModule.forFeature([Member]),
      ],
      providers: [MemberService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(MemberService);
  });

  beforeEach(() => service.repo.clear());
  afterAll(() => moduleRef.close());

  it('loads the entity metadata from forFeature registrations alone', async () => {
    await service.repo.save({ name: 'auto' });
    await expect(service.repo.findOneBy({ name: 'auto' })).resolves.toMatchObject({
      name: 'auto',
    });
  });

  it('resolves the transaction-aware repository (rollback works), not the plain one', async () => {
    await expect(service.createAndFail('a')).rejects.toThrow('boom');
    await expect(service.repo.count()).resolves.toBe(0);
  });
});
