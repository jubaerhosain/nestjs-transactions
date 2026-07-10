import { defineConfig } from 'prisma/config';

// Shares the integration-test Postgres container (postgres-a, compose.yml) with
// the typeorm package, but inside a dedicated `prisma` Postgres schema so
// `prisma db push` never touches the typeorm tables in the public schema.
const port = process.env.PG_A_PORT ?? '54321';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: `postgresql://test:test@localhost:${port}/test?schema=prisma`,
  },
});
