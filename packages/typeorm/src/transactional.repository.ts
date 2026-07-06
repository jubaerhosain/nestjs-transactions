import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-transactions/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

/**
 * Base class for custom repositories. `repo.extend()` and hand-rolled
 * repository classes hold on to a fixed EntityManager and cannot be silently
 * intercepted — extend this instead and use `this.repo` / `this.manager`,
 * which always reflect the current transaction.
 *
 * The entity and the {@link TransactionHost} are supplied through the
 * constructor, so subclasses stay plain classes (no abstract field, no mixin
 * factory) and user-defined base repositories are just generic subclasses.
 *
 * ```ts
 * @Injectable()
 * export class MemberRepository extends TransactionalRepository<Member> {
 *   constructor(txHost: TransactionHost<TransactionalAdapterTypeOrm>) {
 *     super(Member, txHost);
 *   }
 *
 *   findByEmail(email: string) {
 *     return this.repo.findOneBy({ email });
 *   }
 * }
 * ```
 *
 * Share behaviour across repositories with your own generic base — a plain
 * abstract subclass, no factories. It can pull in extra request context (e.g.
 * `ClsService` for the current user) and pass it up:
 *
 * ```ts
 * export abstract class BaseRepository<E extends ObjectLiteral> extends TransactionalRepository<E> {
 *   constructor(
 *     entity: EntityTarget<E>,
 *     txHost: TransactionHost<TransactionalAdapterTypeOrm>,
 *     protected readonly cls: ClsService,
 *   ) {
 *     super(entity, txHost);
 *   }
 *
 *   findAll(): Promise<E[]> {
 *     return this.repo.find();
 *   }
 *
 *   protected get currentUserId(): string | undefined {
 *     return this.cls.get('userId');
 *   }
 * }
 *
 * @Injectable()
 * export class MemberRepository extends BaseRepository<Member> {
 *   constructor(txHost: TransactionHost<TransactionalAdapterTypeOrm>, cls: ClsService) {
 *     super(Member, txHost, cls);
 *   }
 * }
 * ```
 *
 * For a named connection, inject the matching host with
 * `@InjectTransactionHost('name')`:
 *
 * ```ts
 * @Injectable()
 * export class StatRepository extends TransactionalRepository<Stat> {
 *   constructor(@InjectTransactionHost('stats') txHost: TransactionHost<TransactionalAdapterTypeOrm>) {
 *     super(Stat, txHost);
 *   }
 * }
 * ```
 */
@Injectable()
export class TransactionalRepository<Entity extends ObjectLiteral> {
  constructor(
    protected readonly entity: EntityTarget<Entity>,
    protected readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  /** The current EntityManager — transactional inside `@Transactional()`. */
  protected get manager(): EntityManager {
    return this.txHost.tx;
  }

  /** The entity's repository on the current EntityManager. */
  protected get repo(): Repository<Entity> {
    return this.manager.getRepository(this.entity);
  }
}
