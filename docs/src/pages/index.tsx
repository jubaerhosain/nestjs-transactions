import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const SAMPLE = `@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(Member) private readonly repo: Repository<Member>,
    private readonly accounting: AccountingService,
  ) {}

  @Transactional()
  async register(name: string) {
    const member = await this.repo.save({ name });
    await this.accounting.openAccount(member); // joins the SAME transaction
    return member;                              // no decorator needed there
  }
}`;

type Feature = { title: string; description: ReactNode };

const FEATURES: Feature[] = [
  {
    title: 'Invisible propagation',
    description: (
      <>
        Transactions flow through CLS (<code>AsyncLocalStorage</code>), so a call several services
        deep joins the same transaction and rolls back together.
      </>
    ),
  },
  {
    title: 'No monkey-patching',
    description: (
      <>
        Built on the actively maintained <code>@nestjs-cls/transactional</code>. TypeORM and Prisma
        classes are never patched at startup — a library upgrade can’t break you unexpectedly.
      </>
    ),
  },
  {
    title: 'Familiar ergonomics',
    description: (
      <>
        Keep <code>@InjectRepository(Entity)</code>, add <code>@Transactional()</code>, done. The
        decorator-based DX of <code>typeorm-transactional</code>, on a maintained foundation.
      </>
    ),
  },
];

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className={clsx('hero__subtitle', styles.heroTagline)}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started">
            Get started →
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/docs/typeorm">
            TypeORM adapter
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/docs/prisma">
            Prisma adapter
          </Link>
        </div>
        <div className={styles.heroCode}>
          <CodeBlock language="ts">{SAMPLE}</CodeBlock>
        </div>
      </div>
    </header>
  );
}

function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FEATURES.map((feature) => (
            <div key={feature.title} className={clsx('col col--4')}>
              <div className="padding-horiz--md">
                <Heading as="h3">{feature.title}</Heading>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} — declarative @Transactional() for NestJS`}
      description="Declarative @Transactional() for NestJS with TypeORM and Prisma. Transactions propagate through CLS across services, with zero monkey-patching."
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
