# @nestjs-transactions/prisma

## 1.0.3

### Patch Changes

- [#40](https://github.com/jubaerhosain/nestjs-transactions/pull/40) [`0f87b7a`](https://github.com/jubaerhosain/nestjs-transactions/commit/0f87b7a6728c7310d6ced44f3aa726ac4f4d5ed0) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add a `homepage` field pointing at the new documentation site
  (https://jubaerhosain.github.io/nestjs-transactions/) and slim the `prisma` and
  `core` READMEs to concise landing pages that link to the full docs (the
  `typeorm` README keeps its full manual). The comprehensive documentation now
  lives on the docs site as the single source of truth.
- Updated dependencies [[`0f87b7a`](https://github.com/jubaerhosain/nestjs-transactions/commit/0f87b7a6728c7310d6ced44f3aa726ac4f4d5ed0)]:
  - @nestjs-transactions/core@0.4.4

## 1.0.2

### Patch Changes

- [#33](https://github.com/jubaerhosain/nestjs-transactions/pull/33) [`82b09bf`](https://github.com/jubaerhosain/nestjs-transactions/commit/82b09bfc1eacd310d47adbd64cd7a54030bf9f2a) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - Add a `homepage` field pointing at the new documentation site
  (https://jubaerhosain.github.io/nestjs-transactions/) and slim the `prisma` and
  `core` READMEs to concise landing pages that link to the full docs (the
  `typeorm` README keeps its full manual). The comprehensive documentation now
  lives on the docs site as the single source of truth.
- Updated dependencies [[`82b09bf`](https://github.com/jubaerhosain/nestjs-transactions/commit/82b09bfc1eacd310d47adbd64cd7a54030bf9f2a)]:
  - @nestjs-transactions/core@0.4.3

## 1.0.1

### Patch Changes

- [#26](https://github.com/jubaerhosain/nestjs-transactions/pull/26) [`fbaa4dd`](https://github.com/jubaerhosain/nestjs-transactions/commit/fbaa4ddf2d69805a8ea54fbeede1863e935c0391) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - docs(prisma): publish the enhanced README to the npm registry — detailed usage and configuration examples. npm only refreshes the README on a new version, so this patch republishes the package with the updated docs.

## 1.0.0

### Major Changes

- [#16](https://github.com/jubaerhosain/nestjs-transactions/pull/16) [`e33c085`](https://github.com/jubaerhosain/nestjs-transactions/commit/e33c0857c14057ea9239aa6c478abd2b3b77ab8b) Thanks [@jubaerhosain](https://github.com/jubaerhosain)! - First stable release of `@nestjs-transactions/prisma` (1.0.0). Inject one transaction-aware Prisma client (`@InjectPrismaClient()`), add `@Transactional()` (object-form options: `connectionName`, `propagation`, `maxWait`, `timeout`, `isolationLevel`), and queries run inside the active interactive transaction — propagated through CLS with no monkey-patching, at full parity with the typeorm adapter.

  Includes `TransactionalModule.forRoot`/`forRootAsync`, the transaction lifecycle hooks re-exported from core, a `./testing` no-op module, and a new `IsolationLevel` enum for ergonomic, typo-proof isolation levels.
