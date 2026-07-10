/**
 * Prisma transaction isolation levels, as an enum. The values are Prisma's own
 * `Prisma.TransactionIsolationLevel` literals, so `IsolationLevel.SERIALIZABLE`
 * is accepted anywhere a raw `'Serializable'` string is — with autocomplete and
 * no typos. Member names are SCREAMING_SNAKE to match the typeorm adapter's
 * `IsolationLevel`, so `IsolationLevel.SERIALIZABLE` reads identically in both
 * adapters even though the underlying string value differs.
 *
 * Note: unlike the typeorm adapter's `IsolationLevel`, the compile-time guard
 * that keeps these in sync with Prisma's own literals lives in the tests
 * (`test/unit/isolation-level.spec.ts`), NOT here. Prisma's isolation-level
 * union is only available on the *generated* client (`Prisma.TransactionIsolationLevel`),
 * and `src/` deliberately never imports the generated client (so `pnpm build`
 * works without `prisma generate`, and custom-output clients are supported).
 *
 * @example
 * ```ts
 * @Transactional({ isolationLevel: IsolationLevel.SERIALIZABLE })
 * async doWork() { ... }
 * ```
 */
export enum IsolationLevel {
  READ_UNCOMMITTED = 'ReadUncommitted',
  READ_COMMITTED = 'ReadCommitted',
  REPEATABLE_READ = 'RepeatableRead',
  SERIALIZABLE = 'Serializable',
}
