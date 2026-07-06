import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DataSourceOptions } from 'typeorm';

@Entity()
export class Member {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

@Entity()
export class Stat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  label!: string;
}

export const PG_A: DataSourceOptions = {
  type: 'postgres',
  host: 'localhost',
  port: Number(process.env.PG_A_PORT ?? 54321),
  username: 'test',
  password: 'test',
  database: 'test',
  entities: [Member],
  synchronize: true,
};

export const PG_B: DataSourceOptions = {
  type: 'postgres',
  host: 'localhost',
  port: Number(process.env.PG_B_PORT ?? 54322),
  username: 'test',
  password: 'test',
  database: 'test',
  entities: [Stat],
  synchronize: true,
};
