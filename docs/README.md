# nestjs-transactions docs site

The [Docusaurus](https://docusaurus.io/) documentation site for
`nestjs-transactions`, deployed to GitHub Pages at
<https://jubaerhosain.github.io/nestjs-transactions/>.

This is a **private** workspace package — it is never published to npm, and it is
deliberately outside `packages/*` so the library build/test/publish scripts skip
it (see the root `CLAUDE.md`).

## Local development

Run from the repo root (after `pnpm install`):

```bash
pnpm --filter @nestjs-transactions/docs docs:dev     # dev server at http://localhost:3000/nestjs-transactions/
pnpm --filter @nestjs-transactions/docs docs:build   # production build → docs/build
pnpm --filter @nestjs-transactions/docs docs:serve   # serve the production build locally
pnpm --filter @nestjs-transactions/docs docs:clear   # clear the Docusaurus cache
```

## Content

- Authored Markdown lives in `docs/` (one file per page).
- The sidebar/ordering is defined manually in `sidebars.ts`.
- SEO config (sitemap, canonical, Open Graph, JSON-LD) lives in
  `docusaurus.config.ts`; `static/robots.txt` points crawlers at the sitemap.
- This site is the **single source of truth** for comprehensive docs; the npm
  package READMEs are slim landing pages that link here.

## Deployment

Pushes to `main` that touch `docs/**` trigger `.github/workflows/docs.yml`, which
builds the site and deploys it to GitHub Pages via `actions/deploy-pages`.
