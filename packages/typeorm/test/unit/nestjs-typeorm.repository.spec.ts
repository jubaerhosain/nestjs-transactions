import { TransactionHost } from '@nestjs-transactions/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { EntityManager, Repository } from 'typeorm';

import { NestjsTypeormRepository } from '../../src/nestjs-typeorm.repository';

class Member {}

// This spec pins the mechanism the class depends on: TypeORM's Repository
// assigns `manager` as a plain own data property in its constructor and reads
// `this.manager` dynamically per method call. If a future TypeORM release
// changes either (e.g. a #private field or an accessor), these tests trip.
describe('NestjsTypeormRepository', () => {
  const metadata = { target: Member, targetName: 'Member' };

  function createManager() {
    return {
      connection: { getMetadata: jest.fn(() => metadata) },
      find: jest.fn(async () => ['found']),
      save: jest.fn(async (target: unknown, entity: unknown) => entity),
    } as unknown as EntityManager;
  }

  let current: EntityManager;
  const txHost = {
    get tx() {
      return current;
    },
  } as TransactionHost<TransactionalAdapterTypeOrm>;

  class MemberRepository extends NestjsTypeormRepository<Member> {
    constructor() {
      super(Member, txHost);
    }
  }

  beforeEach(() => {
    current = createManager();
  });

  it('is a real TypeORM Repository', () => {
    expect(new MemberRepository()).toBeInstanceOf(Repository);
  });

  it('stores the entity as the standard `target`', () => {
    expect(new MemberRepository().target).toBe(Member);
  });

  it('resolves `manager` from txHost.tx live, tracking swaps', () => {
    const repo = new MemberRepository();
    const managerA = current;
    expect(repo.manager).toBe(managerA);

    current = createManager(); // a transaction became active
    expect(repo.manager).toBe(current);
    expect(repo.manager).not.toBe(managerA);
  });

  it('delegates inherited methods to the manager current AT CALL TIME', async () => {
    const repo = new MemberRepository();
    const managerA = current;

    await expect(repo.find({ where: {} })).resolves.toEqual(['found']);
    expect(managerA.find).toHaveBeenCalledWith(Member, { where: {} });

    const managerB = (current = createManager());
    await repo.save({});
    expect(managerB.save).toHaveBeenCalled();
    expect(managerA.save).not.toHaveBeenCalled();
  });

  it('does not pin a queryRunner (createQueryBuilder must fall back to the tx manager’s)', () => {
    expect(new MemberRepository().queryRunner).toBeUndefined();
  });

  it('keeps `manager` non-enumerable (out of spreads and Object.keys)', () => {
    expect(Object.keys(new MemberRepository())).not.toContain('manager');
  });

  describe('extend()', () => {
    it('returns a live clone: custom methods see the CURRENT manager after a swap', () => {
      const repo = new MemberRepository();
      const extended = repo.extend({
        currentManager(): EntityManager {
          return this.manager;
        },
      });

      current = createManager();
      expect(extended.currentManager()).toBe(current);
    });

    it('retains the base Repository methods and target', async () => {
      const extended = new MemberRepository().extend({});
      expect(extended.target).toBe(Member);
      await extended.find({});
      expect(current.find).toHaveBeenCalledWith(Member, {});
    });
  });
});
