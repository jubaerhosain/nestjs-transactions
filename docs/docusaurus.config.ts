import fs from 'node:fs';
import path from 'node:path';
import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const url = 'https://jubaerhosain.github.io';
const baseUrl = '/nestjs-transactions/';
const repoUrl = 'https://github.com/jubaerhosain/nestjs-transactions';

const config: Config = {
  title: 'nestjs-transactions',
  tagline: 'Declarative @Transactional() for NestJS — TypeORM & Prisma, no monkey-patching',
  favicon: 'img/favicon.svg',

  // Production URL and base path for a GitHub Pages project site.
  url,
  baseUrl,
  organizationName: 'jubaerhosain',
  projectName: 'nestjs-transactions',
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
    // url + baseUrl instead of being hardcoded in a static file.
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
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          filename: 'sitemap.xml',
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
