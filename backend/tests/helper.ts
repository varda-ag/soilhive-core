import path from "path";
import request from "supertest";
import { app } from "../src/app";
import { exec } from "child_process";
import { destroyDataSource, getDataSource, initializeSchema, isDBAvailable } from "../src/utils/data-source";
import { sleep } from "../src/utils/utils";
import { setupTestEnv } from "./environment";
import assert from "assert";

export const startDockerCompose = async () => {
  setupTestEnv();
  const yaml = path.join(__dirname, "docker-compose.yml");
  exec(`docker compose -f ${yaml} up -d`);
  let count = 0;
  let error = undefined;
  while (count++ < 10) {
    try {
      const ok = await isDBAvailable();
      if (ok) {
        await initializeSchema();
        return;
      }
    } catch (e) {
      // Ignore, retry
      error = e;
    }
    // Waiting for Postgres to be ready...
    await sleep(500);
  }
  throw new Error("Failed to connect to Dockerized Postgres (is the deamon running?): " + error);
};

export const teardown = async () => {
  await destroyDataSource();
};

export const clearDatabase = async () => {
  const dataSource = await getDataSource();
  const tableNames = dataSource?.entityMetadatas.map((entity) => `"${entity.tableName}"`).join(", ");
  await dataSource?.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
  await dataSource?.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);
};

export const getSuperAdminToken = async (): Promise<string> => {
  const res = await request(app).post("/oauth/token").type("form").send({
    grant_type: "password",
    username: "mock",
    password: "superadmin",
  });
  assert(res.body.access_token, `There was an error getting the test access token: ${res.body.detail}`)
  return res.body.access_token;
};
