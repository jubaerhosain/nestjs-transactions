---
'@nestjs-transactions/typeorm': patch
'@nestjs-transactions/prisma': patch
'@nestjs-transactions/core': patch
---

Point the documentation links at the site's new home,
[nestjs-transactions.jubaer.dev](https://nestjs-transactions.jubaer.dev).

The docs site moved from GitHub Pages to Cloudflare Workers. Serving it from its
own subdomain instead of a project subpath puts `robots.txt` at the host root,
where crawlers actually read it — on the old `/nestjs-transactions/` subpath the
generated `robots.txt` (and the `Sitemap:` line in it) was never fetched.

Only the `homepage` field and README links change; there is no change to any
package's code or types. The previous URL keeps redirecting, so links in
already-published versions continue to work.
