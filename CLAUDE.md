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

pnpm workspace (`pnpm-workspace.yaml` → `packages/*` + `docs`).

| Package                        | Path               | Role                                                                                   |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `@nestjs-transactions/core`    | `packages/core`    | ORM-agnostic building blocks + adapter-author SPI. Not imported directly by end users. |
| `@nestjs-transactions/typeorm` | `packages/typeorm` | The TypeORM adapter — the package end users install.                                   |
| `@nestjs-transactions/prisma`  | `packages/prisma`  | The Prisma adapter — the package end users install.                                    |

**`docs/` — the documentation site.** A **private, non-published**
[Docusaurus](https://docusaurus.io/) workspace package
(`@nestjs-transactions/docs`) that deploys to GitHub Pages at
`https://jubaerhosain.github.io/nestjs-transactions/`. It lives at top-level
`docs/` (deliberately **outside** `packages/*`) and uses **unique script names**
(`docs:dev`/`docs:build`/`docs:serve`), so `pnpm -r build`/`typecheck`/`test`
skip it (no matching script) and `pnpm -r publish` skips it (`private: true`) —
no CI or root-script changes were needed. **The docs site is the single source of
truth for comprehensive docs.** The `prisma` and `core` npm READMEs are slim
landing pages that link to it; the `typeorm` README deliberately keeps the full
manual for now (a deliberate decision — npm users get complete docs without
leaving the page), so TypeORM doc edits must be mirrored between the README and
`docs/docs/typeorm/*`.

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
| `pnpm -r test:cov`  | Unit tests with coverage (`jest --coverage`). Informational only — no thresholds, not a CI gate.                                                                                                                                                   |
| `pnpm -r test:int`  | Integration tests (typeorm + prisma). Needs Postgres — see below.                                                                                                                                                                                  |
| `pnpm changeset`    | Record a changeset for a user-facing change.                                                                                                                                                                                                       |
| `pnpm ci:publish`   | Build + publish (used by release CI).                                                                                                                                                                                                              |

### Docs site (`docs/`)

Run via pnpm's filter (unique script names so `pnpm -r` never picks them up):

| Command                                                  | What it does                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @nestjs-transactions/docs docs:dev`       | Docusaurus dev server at `http://localhost:3000/nestjs-transactions/`. |
| `pnpm --filter @nestjs-transactions/docs docs:build`     | Production build → `docs/build` (used by the deploy workflow).         |
| `pnpm --filter @nestjs-transactions/docs docs:serve`     | Serve the production build locally (verifies the real base URL).       |
| `pnpm --filter @nestjs-transactions/docs docs:clear`     | `docusaurus clear` — wipe `docs/build` + `docs/.docusaurus` caches.    |
| `pnpm --filter @nestjs-transactions/docs docs:typecheck` | `tsc` — type-check the site (config, sidebars, React pages).           |

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
- **Dependency build scripts are gated** in `pnpm-workspace.yaml` — pnpm 11
  blocks dependency postinstall scripts by default. The `allowBuilds` map
  allows `prisma` and `@prisma/engines` (needed for `prisma generate`/`db push`)
  and explicitly declines `core-js` (a Docusaurus transitive dependency whose
  postinstall only prints a funding banner — set to `false` to silence pnpm's
  "ignored build scripts" warning). The prisma package's `typecheck`/`test:int`
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
- **Docs deploy** (`.github/workflows/docs.yml`): builds `docs/` and deploys to
  GitHub Pages via `actions/deploy-pages` on pushes to `main` under `docs/**` (or
  manual `workflow_dispatch`). It is a **PR-independent producer, not a required
  check**, and never pushes to `main`, so it's orthogonal to the branch ruleset.
  Requires the one-time repo setting Settings → Pages → Source = "GitHub Actions".
  The `docs/` dir is excluded from `eslint.config.mjs` `ignores` and its build
  output from `.prettierignore` specifically so the `lint` job (`eslint .` +
  `prettier --check .`) stays green — don't remove those ignores.
- **Docs changes need a changeset only when they touch published packages.** The
  docs site itself is private (no changeset). But editing a published
  `package.json` (e.g. the `homepage` field) or a package README **is** a
  user-facing change — add a `pnpm changeset` so the release workflow versions and
  publishes it.
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
