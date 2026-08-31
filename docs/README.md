# nestjs-transactions docs site

The [Docusaurus](https://docusaurus.io/) documentation site for
`nestjs-transactions`, deployed to Cloudflare Workers at
<https://nestjs-transactions.jubaer.dev>.

This is a **private** workspace package — it is never published to npm, and it is
deliberately outside `packages/*` so the library build/test/publish scripts skip
it (see the root `CLAUDE.md`).

## Local development

Run from the repo root (after `pnpm install`):

```bash
pnpm --filter @nestjs-transactions/docs docs:dev     # dev server at http://localhost:3000/
pnpm --filter @nestjs-transactions/docs docs:build   # production build → docs/build
pnpm --filter @nestjs-transactions/docs docs:serve   # serve the production build locally
pnpm --filter @nestjs-transactions/docs docs:clear   # clear the Docusaurus cache
```

## Content

- Authored Markdown lives in `docs/` (one file per page).
- The sidebar/ordering is defined manually in `sidebars.ts`.
- SEO config (sitemap, canonical, Open Graph, JSON-LD) lives in
  `docusaurus.config.ts`. `robots.txt` is **generated** there by the
  `emit-robots-txt` plugin, not committed — it derives the `Sitemap:` URL from
  `url` + `baseUrl` so it cannot drift from the real host.
- This site is the **single source of truth** for comprehensive docs; the
  `prisma` and `core` npm READMEs are slim landing pages that link here (the
  `typeorm` README deliberately keeps the full manual for now — edits to
  TypeORM docs must be mirrored there).

## Hosting

**Cloudflare Workers static assets**, at <https://nestjs-transactions.jubaer.dev>.
Built and deployed by **Workers Builds** — Cloudflare's own Git integration —
which watches this repo directly. There is **no GitHub Actions deploy workflow**;
`git push` to `main` is the whole deploy.

Half of the configuration is `wrangler.jsonc` (asset routing, in this repo). The
other half lives in the Cloudflare dashboard, under the Worker →
Settings → Builds, and **nothing in the repo can enforce it**, so this table is
the only record. Keep it in sync in the same PR as any dashboard change:

| Setting                                  | Value                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker name                              | `nestjs-transactions-docs`                                                                                                                                      |
| Repository                               | `jubaerhosain/nestjs-transactions`                                                                                                                              |
| Production branch                        | `main`                                                                                                                                                          |
| Root directory                           | `/` _(repo root — a pnpm workspace install must resolve `pnpm-workspace.yaml`)_                                                                                 |
| Build variable `SKIP_DEPENDENCY_INSTALL` | `1`                                                                                                                                                             |
| Build variable `PNPM_VERSION`            | `11.10.0`                                                                                                                                                       |
| Build command                            | `git fetch --unshallow \|\| true && pnpm install --frozen-lockfile --filter @nestjs-transactions/docs... && pnpm --filter @nestjs-transactions/docs docs:build` |
| Deploy command                           | `npx wrangler@4 deploy --config docs/wrangler.jsonc`                                                                                                            |
| Non-production branch deploy command     | `npx wrangler@4 versions upload --config docs/wrangler.jsonc`                                                                                                   |
| Custom Domain                            | `nestjs-transactions.jubaer.dev` _(Worker → Settings → Domains & Routes)_                                                                                       |

Each of those is load-bearing:

- **`git fetch --unshallow`** — Cloudflare clones at depth 1. Docusaurus reads
  each page's last-modified date from `git log`, so in a shallow clone **every**
  page reports the clone's single commit date instead of its own. That silently
  turns both `sitemap.xml`'s `lastmod` and the "Last updated" footer into the
  build date, telling Google all 23 pages change on every deploy — a false signal
  that is worse than omitting `lastmod` entirely. `|| true` keeps an
  already-complete clone from failing the build.
- **`SKIP_DEPENDENCY_INSTALL=1`** — Cloudflare's automatic install ignores the
  root directory in a pnpm workspace and installs every project, which drags in
  the Prisma engines this site has no use for. The explicit
  `--filter @nestjs-transactions/docs...` install replaces it.
- **`PNPM_VERSION`** — the build image ships pnpm 10, but the repo pins
  `pnpm@11.10.0` and `allowBuilds` in `pnpm-workspace.yaml` is pnpm 11 syntax
  (pnpm 10 spells it `onlyBuiltDependencies`). Match the repo.
- **`npx wrangler@4`** — pins the major. Wrangler is deliberately _not_ a
  devDependency: it is only ever run by Cloudflare's builder, and adding it would
  slow all six CI jobs with `esbuild`/`workerd` native postinstalls for a tool CI
  never invokes.
- **`--config docs/wrangler.jsonc`** — needed because the root directory is the
  repo root. `assets.directory` inside that file stays relative to the file, so it
  resolves to `docs/build`.

### Verifying a deploy

```bash
# Locally, before pushing. Run from the repo root.
pnpm --filter @nestjs-transactions/docs docs:build

grep Sitemap: docs/build/robots.txt                    # must print the live host
grep -o '<loc>' docs/build/sitemap.xml | wc -l         # 23 -- the sitemap is minified
                                                       # to ONE line, so `grep -c`
                                                       # would misleadingly print 1
grep -c 'changefreq\|priority' docs/build/sitemap.xml  # 0
npx wrangler@4 deploy --dry-run --config docs/wrangler.jsonc   # validates, ships nothing

# After the deploy
curl -s  https://nestjs-transactions.jubaer.dev/robots.txt
curl -sI https://nestjs-transactions.jubaer.dev/docs/typeorm/ | head -1   # 307
curl -sI https://nestjs-transactions.jubaer.dev/nope         | head -1    # 404, not 200
```

### The old GitHub Pages host

`jubaerhosain.github.io/nestjs-transactions` still serves a **redirect stub**
(`.github/workflows/legacy-pages-redirect.yml`) rather than being switched off.
npm tarballs are immutable, so the `homepage` field and README links inside
already-published versions point there permanently and no future release can
rewrite them. Serving the last full build there instead would give two hosts
identical content — duplicate content competing with the canonical host.
