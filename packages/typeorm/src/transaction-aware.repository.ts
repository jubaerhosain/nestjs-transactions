import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-transactional/core';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

/**
 * Base class for custom repositories. `repo.extend()` and hand-rolled
 * repository classes hold on to a fixed EntityManager and cannot be silently
 * intercepted — extend this instead and use `this.repo` / `this.manager`,
 * which always reflect the current transaction.
 *
 * For a named connection, redeclare the constructor with
 * `@InjectTransactionHost('name')`.
 *
 * ```ts
 * @Injectable()
 * export class MemberRepository extends TransactionAwareRepository<Member> {
 *   protected readonly entity = Member;
 *
 *   findByEmail(email: string) {
 *     return this.repo.findOneBy({ email });
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class TransactionAwareRepository<Entity extends ObjectLiteral> {
  protected abstract readonly entity: EntityTarget<Entity>;

  constructor(protected readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** The current EntityManager — transactional inside `@Transactional()`. */
  protected get manager(): EntityManager {
    return this.txHost.tx;
  }

  /** The entity's repository on the current EntityManager. */
  protected get repo(): Repository<Entity> {
    return this.manager.getRepository(this.entity);
  }
}
