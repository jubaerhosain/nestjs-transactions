import fs from 'node:fs';
import path from 'node:path';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const url = 'https://nestjs-transactions.jubaer.dev';
// Must stay '/'. The site is served from its own subdomain, so every generated
// URL — canonical, sitemap <loc>, and above all robots.txt — sits at the host
// root. Under the old GitHub Pages subpath the emit-robots-txt plugin below
// wrote a correct robots.txt to /nestjs-transactions/robots.txt, which no
// crawler ever fetches; the only file Google reads is the one at the host root,
// and that one had no Sitemap: line. That is why the site had zero indexed
// pages. Reintroducing a subpath would reintroduce the bug.
const baseUrl = '/';
const repoUrl = 'https://github.com/jubaerhosain/nestjs-transactions';

const config: Config = {
  title: 'nestjs-transactions',
  tagline: 'Declarative @Transactional() for NestJS — TypeORM & Prisma, no monkey-patching',
  favicon: 'img/favicon.svg',

  // Production URL and base path. Hosted on Cloudflare Workers static assets
  // (docs/wrangler.jsonc), deployed by Workers Builds from main.
  url,
  baseUrl,
  organizationName: 'jubaerhosain',
  projectName: 'nestjs-transactions',
  // Kept false, and wrangler.jsonc's html_handling: "drop-trailing-slash"
  // matches it at the edge so the slashed form of every page 307s here instead
  // of resolving as a second, duplicate URL.
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  // Structured data (JSON-LD) for richer search results.
  headTags: [
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'nestjs-transactions',
        description:
          'Declarative @Transactional() for NestJS with TypeORM and Prisma, built on @nestjs-cls/transactional with no monkey-patching.',
        codeRepository: repoUrl,
        programmingLanguage: 'TypeScript',
        license: 'https://opensource.org/licenses/MIT',
        url: url + baseUrl,
      }),
    },
  ],

  plugins: [
    // Emit robots.txt at build time so the sitemap URL is derived from
    // url + baseUrl instead of being hardcoded in a static file. With
    // baseUrl '/' this lands at build/robots.txt and is therefore served at
    // the host root, which is the only place a crawler looks for it.
    // Verify after any host change: `grep Sitemap: docs/build/robots.txt`.
    () => ({
      name: 'emit-robots-txt',
      postBuild({ outDir }: { outDir: string }) {
        fs.writeFileSync(
          path.join(outDir, 'robots.txt'),
          `User-agent: *\nAllow: /\n\nSitemap: ${url}${baseUrl}sitemap.xml\n`,
        );
      },
    }),
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/tree/main/docs/`,
          // Read from each file's git log — see the sitemap note below.
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          filename: 'sitemap.xml',
          // lastmod is the only one of the three sitemap hints Google actually
          // uses, and only when the values are truthful and differ per URL.
          // changefreq/priority are ignored outright, and ours emitted an
          // identical 'weekly'/0.5 on every URL, so they are dropped.
          lastmod: 'date',
          changefreq: null,
          priority: null,
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // og:image / twitter:image must be a raster format — social crawlers
    // (X, Facebook, LinkedIn, Slack, Discord) don't render SVG. og-card.svg is
    // the editable source; scripts/generate-og-card.mjs renders the PNG from
    // it on every docs:dev/docs:build (the PNG is gitignored).
    image: 'img/og-card.png',
    metadata: [
      {
        name: 'keywords',
        content:
          'nestjs, transactional, typeorm, prisma, transaction, cls, async-local-storage, typeorm-transactional, propagation',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { property: 'og:site_name', content: 'nestjs-transactions' },
      { property: 'og:type', content: 'website' },
      // Google Search Console ownership verification (URL-prefix property).
      // static/googlebb31fc13daeeaa3d.html is the file-based fallback.
      {
        name: 'google-site-verification',
        content: 'WDIso36CdjljXxyIDEqIiAvlCKWQWbyJoDtq2gPEmbk',
      },
    ],
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'nestjs-transactions',
      logo: {
        alt: 'nestjs-transactions logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/typeorm',
          label: 'TypeORM',
          position: 'left',
        },
        {
          to: '/docs/prisma',
          label: 'Prisma',
          position: 'left',
        },
        {
          href: 'https://www.npmjs.com/package/@nestjs-transactions/typeorm',
          label: 'npm',
          position: 'right',
        },
        {
          href: repoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/getting-started' },
            { label: 'TypeORM adapter', to: '/docs/typeorm' },
            { label: 'Prisma adapter', to: '/docs/prisma' },
          ],
        },
        {
          title: 'Packages',
          items: [
            {
              label: '@nestjs-transactions/typeorm',
              href: 'https://www.npmjs.com/package/@nestjs-transactions/typeorm',
            },
            {
              label: '@nestjs-transactions/prisma',
              href: 'https://www.npmjs.com/package/@nestjs-transactions/prisma',
            },
            {
              label: '@nestjs-transactions/core',
              href: 'https://www.npmjs.com/package/@nestjs-transactions/core',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: repoUrl,
            },
            {
              label: '@nestjs-cls/transactional',
              href: 'https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Jubaer Hosain. Built with Docusaurus. MIT License.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
