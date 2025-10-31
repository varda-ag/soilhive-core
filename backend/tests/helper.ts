import path from "path";
import { exec } from "child_process";
import { destroyDataSource, getDataSource } from "../src/utils/data-source";
import { sleep } from "../src/utils/utils";
import { loadEnvFile } from "./environment";

export const startDockerCompose = async () => {
  loadEnvFile();
  const yaml = path.join(__dirname, "docker-compose.yml");
  exec(`docker compose -f ${yaml} up -d`);
  let count = 0;
  while (count++ < 10) {
    try {
      const dataSource = await getDataSource();
      if (dataSource.isInitialized) {
        return;
      }
    } catch (e) {
      // Ignore, retry
    }
    // Waiting for Postgres to be ready...
    await sleep(500);
  }
  throw new Error("Failed to connect to Dockerized Postgres. Is the deamon running?");
};

export const teardown = async () => {
  await destroyDataSource();
};

export const clearDatabase = async () => {
  const dataSource = await getDataSource();
  const tableNames = dataSource?.entityMetadatas.map((entity) => `"${entity.tableName}"`).join(", ");
  await dataSource?.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
};
