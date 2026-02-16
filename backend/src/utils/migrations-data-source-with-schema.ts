import { DataSource } from 'typeorm';
import { getDBPassword, getSSL } from './db-credentials';
import { DatabaseNamingStrategy } from './naming-strategy';
import { setupEnv } from './utils';

setupEnv();

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST!,
  port: Number(process.env.POSTGRES_PORT!),
  username: process.env.POSTGRES_USER!,
  password: getDBPassword,
  ...(process.env.POSTGRES_PASSWORD ? {} : { ssl: getSSL() }),
  database: process.env.POSTGRES_DB!,
  ...(process.env.POSTGRES_SCHEMA ? { schema: process.env.POSTGRES_SCHEMA } : {}),
  entities: ['dist/entities/*.js'],
  migrations: ['dist/migrations/*.js'],
  namingStrategy: new DatabaseNamingStrategy(),
});
