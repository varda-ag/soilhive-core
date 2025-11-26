import "reflect-metadata";
import { DataSource, EntityManager } from "typeorm";
import assert from "assert";
import path from "path";

// This global variable at module level
// is used to apply lazy loading to DB connection
let dataSource: DataSource | null = null;

const createDataSource = async (schema: string): Promise<DataSource> => {
  for (const v of ["HOST", "PORT", "DB", "USER", "PASSWORD", "SCHEMA"]) {
    const name = `POSTGRES_${v}`;
    assert(process.env[name], `Missing environment variable: ${name}`);
  }

  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    username: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    schema,
    entities: [path.join(__dirname, "../entities/**/*{.ts,.js}")],
    migrations: [path.join(__dirname, "../migrations/**/*{.ts,.js}")],
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();
  const escapedSchema = `"${schema}"`;
  await dataSource.query(`SET search_path TO ${escapedSchema}, public`);
  return dataSource;
};

export const initializeSchema = async () => {
  // Connect to "public" schema to create desired schema
  const dataSourcePublic = await createDataSource("public");
  const escapedSchema = `"${process.env.POSTGRES_SCHEMA}"`;
  await dataSourcePublic.query(`CREATE SCHEMA IF NOT EXISTS ${escapedSchema}`);
  await dataSourcePublic.query(`CREATE EXTENSION IF NOT EXISTS postgis SCHEMA ${escapedSchema}`);
  // Connect to custom schema to run migrations
  const dataSource = await createDataSource(process.env.POSTGRES_SCHEMA!);
  await runConditionalMigrations(dataSource);
};

export const isDBAvailable = async (): Promise<boolean> => {
  const dataSourcePublic = await createDataSource("public");
  return dataSourcePublic.isInitialized;
};

export const getDataSource = async (): Promise<DataSource> => {
  if (dataSource && dataSource.isInitialized) {
    // Return global instance
    return dataSource;
  }
  dataSource = await createDataSource(process.env.POSTGRES_SCHEMA!);
  return dataSource;
};

export const getEntityManager = async (): Promise<EntityManager> => {
  const dataSource = await getDataSource();
  return dataSource.manager;
};

export const destroyDataSource = async () => {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
  }
};

const runConditionalMigrations = async (dataSource: DataSource) => {
  const queryRunner = dataSource.createQueryRunner();
  const tableExists = await queryRunner.hasTable("jsonstorage"); // Any table would be fine
  if (!tableExists) {
    await dataSource.runMigrations();
  }
  await queryRunner.release();
};
