# CLAUDE.md

Guidance for working in this repository. Package-specific notes live in
`packages/core/CLAUDE.md` and `packages/typeorm/CLAUDE.md`.

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

**Single symbol identity:** `core` re-exports the canonical decorators, tokens,
and error classes from `@nestjs-cls/transactional`, and every adapter re-exports
them from `core`. Never redefine these symbols in an adapter — always re-export,
so `@Transactional`, `TransactionHost`, `Propagation`, etc. share one identity
across all packages. **One deliberate exception:** the `typeorm` adapter wraps
`@nestjs-cls`'s `Transactional` in its own object-form facade (a single-object
API that resolves the positional-argument ambiguity); see
`packages/typeorm/CLAUDE.md`. All other symbols — including core's own
`Transactional` — remain plain re-exports.

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
| `pnpm -r test:int`  | Integration tests (typeorm only). Needs Postgres — see below.                                                                                                                                                                                      |
| `pnpm changeset`    | Record a changeset for a user-facing change.                                                                                                                                                                                                       |
| `pnpm ci:publish`   | Build + publish (used by release CI).                                                                                                                                                                                                              |

### Integration tests

Require **two Postgres 17 containers**:

```bash
docker compose up -d --wait   # ports 54321 (PG_A_PORT) / 54322 (PG_B_PORT)
pnpm -r test:int              # jest.integration.config.js, --runInBand
```

## Gotchas & conventions

- **Node version split:** published packages support Node **>=20** (`engines`),
  but **pnpm 11 needs Node >=22.13**, so local dev and CI run on Node **22/24**.
  Don't "fix" the `engines` field to match the dev requirement — they're
  intentionally different.
- **`typecheck` depends on `build`:** run `pnpm -r build` before `pnpm typecheck`
  (cross-package types resolve through built `dist`).
- **`main` is protected** (branch ruleset). Work on a branch and open a PR.
  Required CI checks: `lint`, `typecheck`, `build-test` (Node 22 & 24), and
  `integration`. See `.github/workflows/ci.yml`.
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
(`.github/workflows/release.yml`) versions and publishes via `ci:publish`.

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
