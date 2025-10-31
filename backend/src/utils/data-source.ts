import "reflect-metadata";
import { DataSource, EntityManager } from "typeorm";
import assert from "assert";
import path from "path";

let dataSource: DataSource | null = null;

async function createDataSource() {
  assert(process.env.POSTGRES_HOST, "Missing environment variable: POSTGRES_HOST");
  assert(process.env.POSTGRES_PORT, "Missing environment variable: POSTGRES_PORT");
  assert(process.env.POSTGRES_DB, "Missing environment variable: POSTGRES_DB");
  assert(process.env.POSTGRES_USER, "Missing environment variable: POSTGRES_USER");
  assert(process.env.POSTGRES_PASSWORD, "Missing environment variable: POSTGRES_PASSWORD");

  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    entities: [path.join(__dirname, "/../entities/**/*{.ts,.js}")],
    synchronize: true,
    logging: false,
  });
  await dataSource.initialize();
  return dataSource;
}

export const getDataSource = async (): Promise<DataSource> => {
  if (dataSource && dataSource.isInitialized) {
    return dataSource;
  }
  dataSource = await createDataSource();
  return dataSource;
}

export const getEntityManager = async (): Promise<EntityManager> => {
  const dataSource = await getDataSource();
  return dataSource.manager;
}

export const destroyDataSource = async () => {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
  }
};