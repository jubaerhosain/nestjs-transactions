import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

/**
 * Manual sidebar so the ordering and grouping stay explicit and stable
 * (matters for SEO — predictable URLs and breadcrumbs).
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    'concepts',
    {
      type: 'category',
      label: 'TypeORM adapter',
      link: { type: 'doc', id: 'typeorm/index' },
      items: [
        'typeorm/propagation',
        'typeorm/isolation-levels',
        'typeorm/multiple-data-sources',
        'typeorm/hooks',
        'typeorm/programmatic-control',
        'typeorm/custom-repositories',
        'typeorm/testing',
        'typeorm/migration',
        'typeorm/caveats',
      ],
    },
    {
      type: 'category',
      label: 'Prisma adapter',
      link: { type: 'doc', id: 'prisma/index' },
      items: [
        'prisma/propagation',
        'prisma/transaction-options',
        'prisma/multiple-connections',
        'prisma/hooks',
        'prisma/programmatic-control',
        'prisma/testing',
        'prisma/caveats',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: ['core/adapter-authors'],
    },
  ],
};

export default sidebars;
