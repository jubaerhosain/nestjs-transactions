import { Logger, Scope } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Module } from '@nestjs/core/injector/module';
import { TRANSACTION_AWARE } from '@nestjs-transactions/core';
import { DataSource, Repository } from 'typeorm';
import { RepositoryConflictChecker } from '../../src/repository-conflict-checker';

class Member {}

const dsA = { kind: 'A' } as unknown as DataSource;
const dsB = { kind: 'B' } as unknown as DataSource;

/** A real-prototype plain repository bound to a DataSource, without a DB. */
function plainRepo(dataSource: DataSource, target: unknown = Member): Repository<any> {
  const repo = Object.create(Repository.prototype) as Repository<any>;
  Object.assign(repo, { target, manager: { connection: dataSource } });
  return repo;
}

/** Minimal stand-in for our transaction-aware proxy. */
function markedProxy(): object {
  return { [TRANSACTION_AWARE]: true };
}

type FakeWrapper = { instance: unknown; scope?: Scope };

/** Build a ModulesContainer whose modules expose `providers` maps. */
function containerWith(...moduleProviders: Map<unknown, FakeWrapper>[]): ModulesContainer {
  const container = new ModulesContainer();
  moduleProviders.forEach((providers, i) => {
    container.set(`module-${i}`, { providers } as unknown as Module);
  });
  return container;
}

function check(
  container: ModulesContainer,
  severity: 'error' | 'warn' = 'error',
  dataSource: DataSource = dsA,
  connectionName?: string,
): void {
  new RepositoryConflictChecker(container, dataSource, severity, connectionName).onModuleInit();
}

describe('RepositoryConflictChecker', () => {
  it('throws a guided error naming entity and connection for an unmarked plain repository', () => {
    const container = containerWith(new Map([['MemberRepository', { instance: plainRepo(dsA) }]]));

    expect(() => check(container)).toThrow(
      /Plain TypeORM repositories detected on DataSource 'default' for: Member[\s\S]*BYPASS @Transactional/,
    );
    expect(() => check(container, 'error', dsA, 'stats')).toThrow(/DataSource 'stats'/);
  });

  it('exempts tokens shadowed by a marked proxy (our forFeature + its dead internal providers)', () => {
    const container = containerWith(
      // our forFeature module: the marked proxy under the token
      new Map([['MemberRepository', { instance: markedProxy() }]]),
      // the internal @nestjs/typeorm forFeature module: dead plain provider, same token
      new Map([['MemberRepository', { instance: plainRepo(dsA) }]]),
    );

    expect(() => check(container)).not.toThrow();
  });

  it('marker exemption works regardless of module iteration order', () => {
    const container = containerWith(
      new Map([['MemberRepository', { instance: plainRepo(dsA) }]]),
      new Map([['MemberRepository', { instance: markedProxy() }]]),
    );

    expect(() => check(container)).not.toThrow();
  });

  it('ignores repositories bound to another DataSource', () => {
    const container = containerWith(
      new Map([['stats_StatRepository', { instance: plainRepo(dsB) }]]),
    );

    expect(() => check(container, 'error', dsA)).not.toThrow();
  });

  it('skips request/transient-scoped wrappers and non-object instances', () => {
    const container = containerWith(
      new Map<unknown, FakeWrapper>([
        ['request', { instance: plainRepo(dsA), scope: Scope.REQUEST }],
        ['transient', { instance: plainRepo(dsA), scope: Scope.TRANSIENT }],
        ['nullish', { instance: null }],
        ['primitive', { instance: 42 }],
      ]),
    );

    expect(() => check(container)).not.toThrow();
  });

  it('never lets an exotic throwing provider break the sweep', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('hostile');
        },
      },
    );
    const container = containerWith(
      new Map<unknown, FakeWrapper>([
        ['hostile', { instance: hostile }],
        ['MemberRepository', { instance: plainRepo(dsA) }],
      ]),
    );

    // The hostile provider is swallowed; the real offender is still reported.
    expect(() => check(container)).toThrow(/Member/);
  });

  it('warn mode logs instead of throwing', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const container = containerWith(new Map([['MemberRepository', { instance: plainRepo(dsA) }]]));

    expect(() => check(container, 'warn')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Member'));
    warn.mockRestore();
  });

  it('names EntitySchema-style string targets and never touches repo.metadata', () => {
    const repo = plainRepo(dsA, 'member_schema');
    Object.defineProperty(repo, 'metadata', {
      get() {
        throw new Error('EntityMetadataNotFoundError');
      },
    });
    const container = containerWith(new Map([['MemberSchemaRepository', { instance: repo }]]));

    expect(() => check(container)).toThrow(/member_schema/);
  });

  it('aggregates and dedupes offenders across modules', () => {
    class Order {}
    const container = containerWith(
      new Map<unknown, FakeWrapper>([
        ['MemberRepository', { instance: plainRepo(dsA, Member) }],
        ['OrderRepository', { instance: plainRepo(dsA, Order) }],
      ]),
      new Map([['MemberRepository', { instance: plainRepo(dsA, Member) }]]),
    );

    let message = '';
    try {
      check(container);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('Member, Order');
    expect(message.match(/Member,/g)).toHaveLength(1); // deduped by token
  });
});
