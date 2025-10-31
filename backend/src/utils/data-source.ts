import "reflect-metadata";
import { DataSource, EntityManager } from "typeorm";
import assert from "assert";
import path from "path";

// This global variable at module level
// is used to apply lazy loading to DB connection
let dataSource: DataSource | null = null;

async function createDataSource(createSchema: boolean) {
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
    ...(!createSchema && { schema: process.env.POSTGRES_SCHEMA! }),
    entities: [path.join(__dirname, "/../entities/**/*{.ts,.js}")],
    synchronize: true,
    logging: false,
  });
  await dataSource.initialize();
  if (createSchema) {
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${process.env.POSTGRES_SCHEMA}`);
  }
  return dataSource;
}

export const getDataSource = async (): Promise<DataSource> => {
  if (dataSource && dataSource.isInitialized) {
    // Return global instance
    return dataSource;
  }
  // Connect to "public" schema to create desired schema
  await createDataSource(true);
  // Return connection to desired schema
  dataSource = await createDataSource(false);
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
