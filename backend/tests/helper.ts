import path from 'path';
import { pgRestore } from 'pg-dump-restore';
import request from 'supertest';
import { app } from '../src/app';
import { exec } from 'child_process';
import { destroyDataSource, getDataSource, initializeSchema, isDBAvailable } from '../src/utils/data-source';
import { sleep } from '../src/utils/utils';
import { setupTestEnv } from './environment';
import assert from 'assert';
import { getDBPassword } from '../src/utils/db-credentials';
import { readFileSync } from 'fs';

export const startDockerCompose = async () => {
  setupTestEnv();
  const yaml = path.join(__dirname, 'docker-compose.yml');
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
  throw new Error('Failed to connect to Dockerized Postgres (is the deamon running?): ' + error);
};

export const teardown = async () => {
  await destroyDataSource();
};

export const clearDatabase = async () => {
  const excludeTables: string[] = [];
  const includeTables: string[] = ['land_cover'];
  const dataSource = await getDataSource();
  const tableNames = dataSource?.entityMetadatas
    .filter(entity => !excludeTables.includes(entity.tableName))
    .map(entity => `"${entity.tableName}"`)
    .concat(includeTables.map(t => `"${t}"`))
    .join(', ');
  await dataSource?.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
  await dataSource?.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);

  // Drop raw data tables
  const tables: Array<{ table_name: string }> = await dataSource.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        AND table_name LIKE 'file\\_%\\_raw' ESCAPE '\\'`,
    [process.env.POSTGRES_SCHEMA],
  );

  await dataSource.transaction(async manager => {
    for (const { table_name } of tables) {
      await manager.query(`DROP TABLE IF EXISTS "${process.env.POSTGRES_SCHEMA}"."${table_name}" CASCADE`);
    }
  });
};

export const getTableColumns = async (tableName: string): Promise<Array<{ column_name: string; data_type: string }>> => {
  const dataSource = await getDataSource();
  const result = await dataSource.query(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2`,
    [process.env.POSTGRES_SCHEMA, tableName],
  );
  return result;
};

export const getSuperAdminToken = async (): Promise<string> => {
  return getToken('superadmin');
};

export const getDataAdminToken = async (): Promise<string> => {
  return getToken('dataadmin');
};

const getToken = async (password: string): Promise<string> => {
  const res = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'password',
    username: 'mock',
    password: password,
  });
  assert(res.body.access_token, `There was an error getting the test access token: ${res.body.detail}`);
  return res.body.access_token;
};

export const addLandCoverData = async (): Promise<string> => {
  // Loading data (it takes a while)
  const landCoverDump = path.join(__dirname, './assets/land_cover/land_cover.dump');
  await pgRestore(
    {
      host: process.env.POSTGRES_HOST!,
      port: Number(process.env.POSTGRES_PORT!),
      username: process.env.POSTGRES_USER!,
      password: await getDBPassword(),
      database: process.env.POSTGRES_DB!,
    },
    {
      filePath: landCoverDump,
      clean: true, // Clean table if exists
      create: false, // DB creation
    },
  );
  return 'land_cover';
};

export const addLandCoverMappings = async (): Promise<string> => {
  const landCoverMappingsFile = path.join(__dirname, './assets/land_cover/mappings.sql');
  const sql = readFileSync(landCoverMappingsFile, 'utf8');
  const dataSource = await getDataSource();
  await dataSource.query(sql);
  return 'land_cover';
};
