import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule as NestTypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { getDataSourceToken, TypeOrmModule } from '../../src';
import { Member, PG_A, PG_B, Stat } from './fixtures';

// The silent mix-up: OUR forRoot manages the DataSource, but entities are
// registered with @nestjs/typeorm's forFeature — plain repositories that
// bypass @Transactional(). The runtime guard must fail the boot.
describe("mistaken import: our forRoot + forFeature from '@nestjs/typeorm' (real Postgres)", () => {
  it('fails init() with a guided error naming the entity (default: error)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(PG_A), NestTypeOrmModule.forFeature([Member])],
    }).compile();
    // compile() instantiates providers (DataSource included); init() runs the
    // lifecycle hooks where the checker fires. Capture the DataSource first so
    // the failed boot leaves nothing behind.
    const dataSource = moduleRef.get<DataSource>(getDataSourceToken());

    await expect(moduleRef.init()).rejects.toThrow(
      /Plain TypeORM repositories detected on DataSource 'default' for: Member[\s\S]*BYPASS @Transactional/,
    );

    await dataSource.destroy();
  });

  it("repositoryConflictCheck: 'warn' boots and logs instead", async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...PG_A, repositoryConflictCheck: 'warn' }),
        NestTypeOrmModule.forFeature([Member]),
      ],
    }).compile();
    await moduleRef.init();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Member'));

    warn.mockRestore();
    await moduleRef.close();
  });

  it('flags only its own connection in a multi-DataSource app', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(PG_A),
        TypeOrmModule.forRoot({ ...PG_B, name: 'stats' }),
        TypeOrmModule.forFeature([Member]), // correct registration on default
        NestTypeOrmModule.forFeature([Stat], 'stats'), // WRONG registration on 'stats'
      ],
    }).compile();
    const defaultDs = moduleRef.get<DataSource>(getDataSourceToken());
    const statsDs = moduleRef.get<DataSource>(getDataSourceToken('stats'));

    await expect(moduleRef.init()).rejects.toThrow(/DataSource 'stats' for: Stat/);

    await Promise.all([defaultDs.destroy(), statsDs.destroy()]);
  });
});
