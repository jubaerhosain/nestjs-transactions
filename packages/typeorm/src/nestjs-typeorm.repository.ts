import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-transactions/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Repository } from 'typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';

/**
 * Base class for custom repositories — a real `Repository<Entity>` whose
 * inherited methods (`find`, `save`, `createQueryBuilder`, …) always run on
 * the *current* EntityManager: the transactional one inside `@Transactional()`,
 * the base one outside. Hand-rolled repository classes and `repo.extend()`
 * hold on to a fixed EntityManager and cannot be silently intercepted —
 * extend this instead and call the `Repository` API directly on `this`.
 *
 * The entity and the {@link TransactionHost} are supplied through the
 * constructor, so subclasses stay plain classes (no abstract field, no mixin
 * factory) and user-defined base repositories are just generic subclasses.
 *
 * ```ts
 * @Injectable()
 * export class MemberRepository extends NestjsTypeormRepository<Member> {
 *   constructor(txHost: TransactionHost<TransactionalAdapterTypeOrm>) {
 *     super(Member, txHost);
 *   }
 *
 *   findByEmail(email: string) {
 *     return this.findOneBy({ email });
 *   }
 * }
 * ```
 *
 * Share behaviour across repositories with your own generic base — a plain
 * abstract subclass, no factories. It can pull in extra request context (e.g.
 * `ClsService` for the current user) and pass it up:
 *
 * ```ts
 * export abstract class BaseRepository<E extends ObjectLiteral> extends NestjsTypeormRepository<E> {
 *   constructor(
 *     entity: EntityTarget<E>,
 *     txHost: TransactionHost<TransactionalAdapterTypeOrm>,
 *     protected readonly cls: ClsService,
 *   ) {
 *     super(entity, txHost);
 *   }
 *
 *   findAll(): Promise<E[]> {
 *     return this.find();
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
 * export class StatRepository extends NestjsTypeormRepository<Stat> {
 *   constructor(@InjectTransactionHost('stats') txHost: TransactionHost<TransactionalAdapterTypeOrm>) {
 *     super(Stat, txHost);
 *   }
 * }
 * ```
 *
 * Notes:
 * - Tree entities: `TreeRepository`'s extra methods are not inherited here —
 *   call `this.manager.getTreeRepository(this.target)` inside a method (still
 *   transaction-aware), or inject the entity's repository with
 *   `@InjectRepository` (its provider resolves a `TreeRepository`).
 * - Do not re-declare `manager` (or `target`/`queryRunner`) as a field in a
 *   subclass — under ES2022 class-field semantics it would bury the live
 *   `manager` accessor this class installs.
 */
@Injectable()
export class NestjsTypeormRepository<Entity extends ObjectLiteral> extends Repository<Entity> {
  constructor(
    entity: EntityTarget<Entity>,
    protected readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {
    // The manager handed to super() is never observed: Repository's constructor
    // only does a plain `this.manager = manager` assignment, and every data
    // method (and the `metadata` getter) reads `this.manager` per call — so the
    // own data property is immediately replaced with a live accessor below.
    super(entity, undefined as unknown as EntityManager);
    Object.defineProperty(this, 'manager', {
      // The transactional EntityManager inside @Transactional(), the base
      // manager outside. `createQueryBuilder` also joins the transaction:
      // this repository never pins a queryRunner, and EntityManager falls
      // back to its own (the transaction's) queryRunner.
      get: () => txHost.tx,
      // Keep it out of Object.keys / spreads / JSON.stringify.
      enumerable: false,
      // Allow jest.spyOn(repo, 'manager', 'get') in user tests.
      configurable: true,
    });
  }

  /**
   * TypeORM's `Repository#extend` destructures `manager` (freezing the live
   * accessor to whatever manager was current) and re-invokes `this.constructor`
   * with Repository's positional `(target, manager, queryRunner)` — which is a
   * subclass constructor expecting `(entity, txHost)`. Both silently corrupt
   * the result, so clone through the prototype chain instead: the clone keeps
   * inheriting the live `manager` accessor and all subclass methods.
   */
  override extend<CustomRepository>(
    customs: CustomRepository & ThisType<this & CustomRepository>,
  ): this & CustomRepository {
    const extended = Object.create(this) as this & CustomRepository;
    Object.assign(extended, customs);
    return extended;
  }
}
