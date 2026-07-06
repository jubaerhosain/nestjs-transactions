import type { IsolationLevel as TypeOrmIsolationLevel } from 'typeorm/driver/types/IsolationLevel';

/**
 * TypeORM transaction isolation levels, as an enum. The values are TypeORM's
 * own isolation-level literals, so `IsolationLevel.SERIALIZABLE` is accepted
 * anywhere a raw `'SERIALIZABLE'` string is — with autocomplete and no typos.
 *
 * @example
 * ```ts
 * @Transactional<TransactionalAdapterTypeOrm>({ isolationLevel: IsolationLevel.SERIALIZABLE })
 * async doWork() { ... }
 * ```
 */
export enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

// Compile-time guard: every enum value must remain a valid TypeORM isolation
// level. If TypeORM's union ever drifts from ours, this fails the build.
type _AssertInSync = `${IsolationLevel}` extends TypeOrmIsolationLevel ? true : never;
const _assertInSync: _AssertInSync = true;
void _assertInSync;
