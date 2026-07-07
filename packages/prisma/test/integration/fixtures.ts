import { Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// postgres-a from the repo-root compose.yml, in the dedicated `prisma` Postgres
// schema (matching prisma.config.ts) so the typeorm tables stay untouched.
const connectionString = `postgresql://test:test@localhost:${process.env.PG_A_PORT ?? '54321'}/test`;

/**
 * The canonical NestJS Prisma setup: a `PrismaService` extending the generated
 * client, using the (Prisma 7 mandatory) pg driver adapter.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString }, { schema: 'prisma' }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
