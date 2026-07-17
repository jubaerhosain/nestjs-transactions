import { Logger, OnModuleInit, Provider, Scope } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TRANSACTION_AWARE } from '@nestjs-transactions/core';
import { DataSource, Repository } from 'typeorm';

/**
 * INTERNAL — registered per connection by `TypeOrmModule.forRoot/forRootAsync`
 * (unless `repositoryConflictCheck: 'off'`).
 *
 * Detects the silent mix-up the type system cannot catch: entity repositories
 * registered with `@nestjs/typeorm`'s `TypeOrmModule.forFeature` (or hand-rolled
 * `Repository` providers) on a DataSource that this package manages. Those are
 * plain repositories bound to the base EntityManager — they bypass
 * `@Transactional()` and their writes escape rollback, silently.
 *
 * Mechanism: every proxy produced by our `forFeature` answers `true` to the
 * `TRANSACTION_AWARE` marker (without resolving its target). At `onModuleInit`
 * — after ALL providers are instantiated, before app bootstrap work — we sweep
 * Nest's `ModulesContainer`: any `instanceof Repository` provider instance on
 * OUR DataSource whose DI token has no marked instance anywhere was registered
 * the wrong way.
 *
 * Tokens shared between our proxy and the dead plain providers our own
 * `forFeature` internally creates (via `@nestjs/typeorm`'s `forFeature`, kept
 * for the `autoLoadEntities` side effect) are exempted by the marker grouping.
 */
export class RepositoryConflictChecker implements OnModuleInit {
  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly dataSource: DataSource,
    private readonly severity: 'error' | 'warn',
    private readonly connectionName: string | undefined,
  ) {}

  onModuleInit(): void {
    const marked = new Set<unknown>();
    const candidates: { token: unknown; instance: Repository<any> }[] = [];

    for (const module of this.modulesContainer.values()) {
      for (const [token, wrapper] of module.providers) {
        try {
          // Request/transient wrappers hold per-context instances (and possibly
          // un-constructed placeholders) — only singletons are inspectable.
          if (wrapper.scope === Scope.REQUEST || wrapper.scope === Scope.TRANSIENT) {
            continue;
          }
          const instance = wrapper.instance as Record<symbol, unknown> | null;
          if (instance === null || typeof instance !== 'object') {
            continue;
          }
          // Marker first: our proxies answer without resolving their target.
          if (instance[TRANSACTION_AWARE] === true) {
            marked.add(token);
            continue;
          }
          // instanceof is safe here: our proxies were diverted above, and the
          // @nestjs-cls transaction proxy wraps an EntityManager (never a
          // Repository). TreeRepository/MongoRepository extend Repository, so
          // all @nestjs/typeorm provider variants are caught.
          if (
            instance instanceof Repository &&
            (instance as Repository<any>).manager?.connection === this.dataSource
          ) {
            candidates.push({ token, instance: instance as Repository<any> });
          }
        } catch {
          // Exotic user providers (throwing proxies, …) must never break boot.
        }
      }
    }

    const offenders = new Map<unknown, string>();
    for (const { token, instance } of candidates) {
      // A marked instance under the same token means OUR proxy shadows this
      // plain repository (the dead providers of our internal forFeature import).
      if (!marked.has(token) && !offenders.has(token)) {
        offenders.set(token, entityNameOf(instance));
      }
    }
    if (offenders.size === 0) {
      return;
    }

    const message = buildConflictMessage([...offenders.values()], this.connectionName);
    if (this.severity === 'warn') {
      new Logger('TypeOrmModule').warn(message);
    } else {
      throw new Error(message);
    }
  }
}

/**
 * Register the checker for one connection. Instantiated eagerly by Nest, so
 * its `onModuleInit` always runs.
 */
export function provideRepositoryConflictChecker(
  connectionName: string | undefined,
  severity: 'error' | 'warn',
): Provider {
  return {
    provide: `NESTJS_TRANSACTIONS_REPO_CONFLICT_CHECKER_${connectionName ?? 'default'}`,
    inject: [ModulesContainer, getDataSourceToken(connectionName)],
    useFactory: (modulesContainer: ModulesContainer, dataSource: DataSource) =>
      new RepositoryConflictChecker(modulesContainer, dataSource, severity, connectionName),
  };
}

function entityNameOf(repo: Repository<any>): string {
  // NEVER touch repo.metadata — it throws EntityMetadataNotFoundError when the
  // entity is missing from the DataSource. repo.target is a plain property.
  const target = repo.target;
  return typeof target === 'function' ? target.name : String(target);
}

function buildConflictMessage(entities: string[], connectionName: string | undefined): string {
  return (
    `Plain TypeORM repositories detected on DataSource '${connectionName ?? 'default'}' for: ` +
    `${entities.join(', ')}. They were registered with TypeOrmModule.forFeature from ` +
    `'@nestjs/typeorm' (or a custom Repository provider), so they BYPASS @Transactional() — ` +
    `writes will NOT roll back. Import TypeOrmModule from '@nestjs-transactions/typeorm' in ` +
    `the modules registering these entities. For hand-rolled repository classes extending ` +
    `Repository, extend TransactionalRepository instead. If this is intentional, set ` +
    `repositoryConflictCheck: 'warn' or 'off' in TypeOrmModule.forRoot().`
  );
}
