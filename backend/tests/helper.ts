import path from 'path';
import { dbRestore } from '../src/utils/db-restore';
import request from 'supertest';
import { app } from '../src/app';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PgBoss } from 'pg-boss';
import { destroyDataSource, getDataSource, initializeSchema, isDBAvailable } from '../src/utils/data-source';
import { signToken, sleep } from '../src/utils/utils';
import { TOKEN_ISSUER } from '../src/types/enums';
import { schemaForWorker, setupTestEnv, tmpDirForWorker } from './environment';
import assert from 'assert';
import fs, { readFileSync } from 'fs';

const execAsync = promisify(exec);

export const startDockerCompose = async () => {
  setupTestEnv();
  const yaml = path.join(__dirname, 'docker-compose.yml');
  await execAsync(`docker compose -f ${yaml} up -d`);
  let count = 0;
  let error: unknown = undefined;
  while (count++ < 60) {
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

/**
 * Installs pg-boss's own schema for a worker, the way `PG_BOSS_SCHEMA` derives it.
 */
const installPgBossSchema = async (schema: string) => {
  const boss = new PgBoss({
    host: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    database: process.env.POSTGRES_DB!,
    schema: `${schema}_pgboss`,
  });
  boss.on('error', () => {});
  await boss.start();
  await boss.stop({ graceful: false });
};

/**
 * Clears each worker's scratch directory before the workers are forked.
 */
export const resetWorkerTempDirs = (workerCount: number) => {
  for (let id = 1; id <= workerCount; id++) {
    fs.rmSync(tmpDirForWorker(String(id)), { recursive: true, force: true });
  }
};

/**
 * Creates and migrates one schema per Jest worker beyond the first.
 * Worker 1's schema is already done by startDockerCompose, which also creates the postgis,
 * postgis_raster and unaccent extensions in `public` -- the only objects outside its own schema
 * that the migrations touch.
 */
export const initializeWorkerSchemas = async (workerCount: number) => {
  const schemas = Array.from({ length: workerCount }, (_, i) => schemaForWorker(String(i + 1)));
  const original = process.env.POSTGRES_SCHEMA;
  try {
    // One at a time, with POSTGRES_SCHEMA pointed at the target
    for (const schema of schemas.slice(1)) {
      process.env.POSTGRES_SCHEMA = schema;
      await initializeSchema(schema);
    }
  } finally {
    process.env.POSTGRES_SCHEMA = original;
  }
  // pg-boss reads no such variable, so its schemas can go up together.
  await Promise.all(schemas.map(schema => installPgBossSchema(schema)));
};

export const teardown = async () => {
  await destroyDataSource();
};

export const clearDatabase = async () => {
  assert(
    process.env.POSTGRES_SCHEMA?.startsWith('testschema'),
    `clearDatabase can only be run on a test schema, got '${process.env.POSTGRES_SCHEMA}'`,
  );
  const excludeTables: string[] = [];
  const includeTables: string[] = ['land_cover', 'soil_groups'];
  const dataSource = await getDataSource();
  const tableNames = dataSource?.entityMetadatas
    .filter(entity => !excludeTables.includes(entity.tableName))
    .map(entity => `"${entity.tableName}"`)
    .join(', ');
  await dataSource?.query(`TRUNCATE TABLE ${tableNames} CASCADE;`);

  // Different method for tables that may not exist
  for (const table of includeTables) {
    await dataSource?.query(`
    DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${process.env.POSTGRES_SCHEMA}'
          AND table_name = '${table}'
        ) THEN
          TRUNCATE TABLE ${table};
        END IF;
      END
      $$;`);
  }

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

/**
 * Signs a token for a non-admin caller with an explicitly chosen sub and email.
 *
 * Password auth only mints super-admin and data-admin tokens, and both bypass entitlement
 * checks outright — so any entitlement test driven by getDataAdminToken passes vacuously.
 * The two claims are kept deliberately distinct by callers: the Subject is the email, and
 * a test whose sub and email are the same string cannot detect a regression to sub-keying.
 */
export const getUserToken = (sub: string, email: string): string => {
  setupTestEnv(); // Guarantees SELF_SIGNING_SECRET, which signToken asserts on
  return signToken({ sub, email, email_verified: true, scope: 'user', iss: TOKEN_ISSUER }, 3600, { alg: 'HS256', kid: 'kid' });
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

/**
 * Raster filter fixture tables, restored once per run and copied into the test schema on demand.
 */
const RASTER_FIXTURE_TABLES = ['land_cover', 'soil_groups'] as const;

/** Schema holding the pristine, read-only copy the per-test copies are cloned from. */
const RASTER_FIXTURE_SCHEMA = 'testfixtures';

const RASTER_DUMP_SCHEMA = 'testschema';

/**
 * Restores the raster filter dumps once per run into {@link RASTER_FIXTURE_SCHEMA}.
 */
export const loadRasterFilterFixtures = async (): Promise<void> => {
  const dataSource = await getDataSource();
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${RASTER_DUMP_SCHEMA}"`);
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${RASTER_FIXTURE_SCHEMA}"`);
  for (const table of RASTER_FIXTURE_TABLES) {
    const dump = path.join(__dirname, `./assets/${table}/${table}.dump`);
    await dataSource.query(`DROP TABLE IF EXISTS "${RASTER_FIXTURE_SCHEMA}"."${table}" CASCADE`);
    let restoreError: unknown;
    await dbRestore(dump).catch(e => {
      restoreError = e;
    });
    const [{ restored }] = await dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS restored`,
      [RASTER_DUMP_SCHEMA, table],
    );
    if (!restored) {
      throw new Error(`Failed to restore raster filter fixture '${table}' from ${dump}: ${restoreError}`);
    }
    await dataSource.query(`ALTER TABLE "${RASTER_DUMP_SCHEMA}"."${table}" SET SCHEMA "${RASTER_FIXTURE_SCHEMA}"`);
  }
  // The worker schemas are all suffixed, so the bare name is only ever the restore's landing zone.
  // Dropping it also clears out the single shared schema the suite used before it ran per worker.
  assert(
    process.env.POSTGRES_SCHEMA !== RASTER_DUMP_SCHEMA,
    `The dump landing schema '${RASTER_DUMP_SCHEMA}' is in use as POSTGRES_SCHEMA and would be dropped`,
  );
  await dataSource.query(`DROP SCHEMA IF EXISTS "${RASTER_DUMP_SCHEMA}" CASCADE`);
};

/**
 * Gives the current test its own copy of the raster filter tables.
 */
export const addRasterFilterData = async (): Promise<void> => {
  const dataSource = await getDataSource();
  for (const table of RASTER_FIXTURE_TABLES) {
    await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    await dataSource.query(`CREATE TABLE "${table}" (LIKE "${RASTER_FIXTURE_SCHEMA}"."${table}" INCLUDING ALL)`);
    await dataSource.query(`INSERT INTO "${table}" SELECT * FROM "${RASTER_FIXTURE_SCHEMA}"."${table}"`);
  }
};

export const addRasterFilterMappings = async (): Promise<void> => {
  const landCoverMappingsFile = path.join(__dirname, './assets/land_cover/land_cover.mappings');
  const soilGroupsMappingsFile = path.join(__dirname, './assets/soil_groups/soil_groups.mappings');
  const dataSource = await getDataSource();
  const landCoverSql = readFileSync(landCoverMappingsFile, 'utf8');
  await dataSource.query(landCoverSql);
  const soilGroupsSql = readFileSync(soilGroupsMappingsFile, 'utf8');
  await dataSource.query(soilGroupsSql);
  // Also create empty table to have the filter enabled
  await dataSource.query('CREATE TABLE IF NOT EXISTS land_cover();');
  await dataSource.query('CREATE TABLE IF NOT EXISTS soil_groups();');
};

export const addRasterFilters = async (): Promise<void> => {
  const dataSource = await getDataSource();
  await dataSource.query(`
      INSERT INTO "raster_filters" (id,name,description) VALUES ('land_cover','Land cover','The Copernicus Global Land Service (CGLS) provides a series of biogeophysical products (i.e. Leaf Area Index, Land Surface Temperature, soil moisture, etc.) on the status and evolution of land surface at global scale.');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('agroecological_zones', 'Agroecological zones', 'The Food and Agriculture Organization of the United Nations (FAO) and the International Institute for Applied Systems Analysis (IIASA) have cooperated over several decades to develop and implement the Agro-Ecological Zones (AEZ) modeling framework and databases. AEZ relies on well-established land evaluation principles to assess natural resources for finding suitable agricultural land utilization options. Compilation of an AEZ agro-climatic inventory using several climatic variables (e.g. temperature, precipitation, sunshine fraction, relative humidity) gives a <strong>general characterization of climatic resources, signifies their suitability for agricultural use and provides data and indicators related to climatic requirements of crop growth, development and yield formation. Source: © FAO, 2021. Global Agro-Ecological Zones v4');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('soil_groups', 'Soil Groups', 'This filter refers to the categories defined by the WRB, an international soil classification system developed by the IUSS. These groups classify soils based on their physical and chemical properties, providing a standardized framework for naming soils and creating legends for soil maps. FAO & IIASA. 2023. Harmonized World Soil Database version 2.0. Rome and Laxenburg.');
    `);
};
