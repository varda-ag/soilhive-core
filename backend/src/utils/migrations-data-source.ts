import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDBPassword, getSSL } from './db-credentials';

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST!,
  port: Number(process.env.POSTGRES_PORT!),
  username: process.env.POSTGRES_USER!,
  password: getDBPassword,
  ...(process.env.POSTGRES_PASSWORD ? {} : { ssl: getSSL() }),
  database: process.env.POSTGRES_DB!,
  entities: ['dist/entities/*.js'],
  migrations: ['dist/migrations/*.js'],
});
