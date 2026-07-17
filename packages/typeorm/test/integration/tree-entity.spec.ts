import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Tree,
  TreeChildren,
  TreeParent,
  TreeRepository,
} from 'typeorm';
import { InjectRepository, Transactional, TypeOrmModule } from '../../src';
import { PG_A } from './fixtures';

@Entity()
@Tree('closure-table')
class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @TreeChildren()
  children!: Category[];

  @TreeParent()
  parent?: Category;
}

@Injectable()
class CategoryService {
  constructor(
    // The silent provider must resolve a TreeRepository for tree entities, so
    // tree-only methods (findTrees, findDescendants, …) exist on the proxy.
    @InjectRepository(Category) readonly categories: TreeRepository<Category>,
  ) {}

  @Transactional()
  async createTree(root: string, child: string): Promise<void> {
    const parent = await this.categories.save({ name: root });
    await this.categories.save({ name: child, parent });
  }

  @Transactional()
  async createTreeAndFail(root: string, child: string): Promise<void> {
    await this.createTree(root, child);
    throw new Error('boom');
  }
}

describe('tree entities resolve TreeRepository through forFeature (real Postgres)', () => {
  let moduleRef: TestingModule;
  let service: CategoryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ ...PG_A, entities: [Category] }),
        TypeOrmModule.forFeature([Category]),
      ],
      providers: [CategoryService],
    }).compile();
    await moduleRef.init();
    service = moduleRef.get(CategoryService);
  });

  beforeEach(() =>
    service.categories.query('TRUNCATE TABLE "category_closure", "category" CASCADE'),
  );
  afterAll(() => moduleRef.close());

  it('exposes tree-repository methods and returns the nested structure', async () => {
    await service.createTree('root', 'child');

    expect(service.categories).toBeInstanceOf(TreeRepository);
    const trees = await service.categories.findTrees();
    expect(trees).toHaveLength(1);
    expect(trees[0].name).toBe('root');
    expect(trees[0].children.map((c) => c.name)).toEqual(['child']);
  });

  it('rolls back tree writes (including closure rows) when the method throws', async () => {
    await expect(service.createTreeAndFail('root', 'child')).rejects.toThrow('boom');

    await expect(service.categories.count()).resolves.toBe(0);
    const [{ count }] = await service.categories.query(
      'SELECT COUNT(*)::int AS count FROM "category_closure"',
    );
    expect(count).toBe(0);
  });
});
