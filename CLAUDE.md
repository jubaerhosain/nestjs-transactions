# CLAUDE.md

Guidance for working in this repository. Package-specific notes live in
`packages/core/CLAUDE.md`, `packages/typeorm/CLAUDE.md` and
`packages/prisma/CLAUDE.md`.

## Overview

`nestjs-transactions` delivers the developer experience of the (abandoned)
`typeorm-transactional` package — keep `@InjectRepository(Entity)`, add
`@Transactional()`, done — but built **entirely on top of**
[`@nestjs-cls/transactional`](https://papooch.github.io/nestjs-cls/) with **no
monkey-patching**. Transactions propagate through CLS (`AsyncLocalStorage`)
across services. Standard NestJS DI throughout.

## Monorepo layout

pnpm workspace (`pnpm-workspace.yaml` → `packages/*`).

| Package                        | Path               | Role                                                                                   |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `@nestjs-transactions/core`    | `packages/core`    | ORM-agnostic building blocks + adapter-author SPI. Not imported directly by end users. |
| `@nestjs-transactions/typeorm` | `packages/typeorm` | The TypeORM adapter — the package end users install.                                   |
| `@nestjs-transactions/prisma`  | `packages/prisma`  | The Prisma adapter — the package end users install.                                    |

**Single symbol identity:** `core` re-exports the canonical decorators, tokens,
and error classes from `@nestjs-cls/transactional`, and every adapter re-exports
them from `core`. Never redefine these symbols in an adapter — always re-export,
so `@Transactional`, `TransactionHost`, `Propagation`, etc. share one identity
across all packages. **One deliberate exception:** the `typeorm` adapter wraps
`@nestjs-cls`'s `Transactional` in its own object-form facade (a single-object
API that resolves the positional-argument ambiguity); the `prisma` adapter
follows the same facade pattern. See `packages/typeorm/CLAUDE.md`.

The `typeorm` adapter also exports its own unified `NestjsTypeormModule` — a
distinctly-named module (NOT shadowing `@nestjs/typeorm`'s `TypeOrmModule`) that
owns both the DataSource (delegating to `@nestjs/typeorm` internally) and
transaction propagation, so end users import ONE module instead of two (typeorm
only; prisma's module stays `TransactionalModule`). The `@nestjs/typeorm`
helpers the typeorm package re-exports (`InjectRepository`, tokens, …) remain
identity re-exports. All other symbols — including core's own `Transactional` —
remain plain re-exports.

## Commands

Run from the repo root unless noted. `-r` = across all workspace packages.

| Command             | What it does                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`      | Install workspace deps.                                                                                                                                                                                                                            |
| `pnpm -r build`     | `tsc -p tsconfig.build.json` per package → `dist/`.                                                                                                                                                                                                |
| `pnpm lint`         | `eslint .` — covers `src` + `test/**/*.spec.ts`.                                                                                                                                                                                                   |
| `pnpm typecheck`    | `tsc --noEmit -p tsconfig.json` per package. Type-checks **tests too** (jest runs use `isolatedModules` and skip full type-checking). Requires a prior `pnpm -r build` (typeorm resolves `@nestjs-transactions/core` via its built `dist/*.d.ts`). |
| `pnpm format`       | `prettier --check .`.                                                                                                                                                                                                                              |
| `pnpm -r test:unit` | Jest unit tests (`test/unit/**` + `src/**/*.spec.ts`).                                                                                                                                                                                             |
| `pnpm -r test:int`  | Integration tests (typeorm + prisma). Needs Postgres — see below.                                                                                                                                                                                  |
| `pnpm changeset`    | Record a changeset for a user-facing change.                                                                                                                                                                                                       |
| `pnpm ci:publish`   | Build + publish (used by release CI).                                                                                                                                                                                                              |

### Integration tests

Require **two Postgres 17 containers**:

```bash
docker compose up -d --wait   # ports 54321 (PG_A_PORT) / 54322 (PG_B_PORT)
pnpm -r test:int              # jest.integration.config.js, --runInBand
```

typeorm uses both containers; prisma uses postgres-a only, inside a dedicated
`prisma` Postgres schema (its `test:int` runs `prisma db push` itself), so the
two suites never touch each other's tables.

## Gotchas & conventions

- **Node version split:** published packages support Node **>=20** (`engines`),
  but **pnpm 11 needs Node >=22.13**, so local dev and CI run on Node **22/24**.
  Don't "fix" the `engines` field to match the dev requirement — they're
  intentionally different.
- **`typecheck` depends on `build`:** run `pnpm -r build` before `pnpm typecheck`
  (cross-package types resolve through built `dist`).
- **Prisma build scripts are allowlisted** in `pnpm-workspace.yaml`
  (`allowBuilds`: `prisma`, `@prisma/engines`) — pnpm 11 blocks dependency
  postinstall scripts by default. The prisma package's `typecheck`/`test:int`
  scripts chain `prisma generate`/`db push` themselves (its integration tests
  import the generated client; `src/` never does, so `build` needs no generate).
- **`main` is protected** (branch ruleset). Work on a branch and open a PR.
  Required CI checks: `lint`, `typecheck`, `build-test` (Node 22 & 24), and
  `integration`. The `lint` job also runs `pnpm format` (`prettier --check`).
  See `.github/workflows/ci.yml`.
- **Nightly dependency upgrades** (`.github/workflows/deps-upgrade.yml`): a
  scheduled job (03:00 UTC + manual `workflow_dispatch`) runs `pnpm update -r`
  (newest in-range versions, no major bumps — pnpm 11 also rewrites the caret
  floors in `package.json`, so the PR touches `package.json` + `pnpm-lock.yaml`)
  and force-updates a single standing PR on branch `deps/nightly-upgrade`. It is a
  **PR-producer, not a required check** — the normal CI checks above validate the
  PR. It opens the PR with a repo secret PAT **`DEPS_PR_TOKEN`** (Contents +
  Pull requests: write); the default `GITHUB_TOKEN` is deliberately not used
  because token-authored PRs don't trigger CI. If CI stops running on that PR,
  check the `DEPS_PR_TOKEN` secret first.
- **TypeScript** (`tsconfig.base.json`): `node16` module/resolution, ES2022 CJS,
  `strict`, `isolatedModules`, `experimentalDecorators` + `emitDecoratorMetadata`.
- **ESLint:** `@typescript-eslint/no-explicit-any` and
  `explicit-module-boundary-types` are intentionally disabled
  (`eslint.config.mjs`).
- **Jest globals in tests:** each package's `tsconfig.json` sets
  `"types": ["node", "jest"]`; the `tsconfig.build.json` narrows this to
  `["node"]` so jest globals never leak into the published library.

## Releasing

Uses [Changesets](https://github.com/changesets/changesets). For any user-facing
change, add a changeset (`pnpm changeset`) in the same PR. The release workflow
(`.github/workflows/release.yml`) builds and runs unit tests as its own safety
gate, then versions and publishes via `ci:publish`.

## ⚠️ Keeping these CLAUDE.md files current

These docs are part of the change, not an afterthought. **When you make any of
the following changes, update the relevant `CLAUDE.md` (root and/or package) in
the same commit/PR:**

- Add, rename, or remove a `package.json` script → update the Commands table.
- Add, rename, or remove a `.github/workflows` job or required check → update
  the CI/gotchas notes.
- Add a new package under `packages/` → add it to the layout table and give it
  its own `packages/<name>/CLAUDE.md`.
- Add or change a public export in a package's `src/index.ts` → update that
  package's CLAUDE.md surface list.
- Change a version, Node, tooling, or test-infra requirement (e.g. Postgres
  ports/versions, `engines`, TS config) → update the gotchas/setup notes.
