import path from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { dbRestore } from '../src/utils/db-restore';
import request from 'supertest';
import { app } from '../src/app';
import { exec } from 'child_process';
import { destroyDataSource, getDataSource, initializeSchema, isDBAvailable } from '../src/utils/data-source';
import { sleep } from '../src/utils/utils';
import { setupTestEnv } from './environment';
import assert from 'assert';
import { readFileSync } from 'fs';
import RasterLayerEntity from '../src/entities/RasterLayer';

const execAsync = promisify(exec);

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
  const includeTables: string[] = ['land_cover', 'soil_groups'];
  const dataSource = await getDataSource();
  const tableNames = dataSource?.entityMetadatas
    .filter(entity => !excludeTables.includes(entity.tableName))
    .map(entity => `"${entity.tableName}"`)
    .join(', ');
  await dataSource?.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
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

const getToken = async (password: string): Promise<string> => {
  const res = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'password',
    username: 'mock',
    password: password,
  });
  assert(res.body.access_token, `There was an error getting the test access token: ${res.body.detail}`);
  return res.body.access_token;
};

export const addRasterFilterData = async (): Promise<void> => {
  // Loading data (it takes a while)
  const landCoverDump = path.join(__dirname, './assets/land_cover/land_cover.dump');
  const soilGroupsDump = path.join(__dirname, './assets/soil_groups/soil_groups.dump');
  await dbRestore(landCoverDump).catch(() => {});
  await dbRestore(soilGroupsDump).catch(() => {});
};

export const addRasterFilterMappings = async (): Promise<void> => {
  const landCoverMappingsFile = path.join(__dirname, './assets/land_cover/land_cover.mappings');
  const soilGroupsMappingsFile = path.join(__dirname, './assets/soil_groups/soil_groups.mappings');
  const dataSource = await getDataSource();
  await dataSource.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
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
    SET search_path TO ${process.env.POSTGRES_SCHEMA}, public;
      INSERT INTO "raster_filters" (id,name,description) VALUES ('land_cover','Land cover','The Copernicus Global Land Service (CGLS) provides a series of biogeophysical products (i.e. Leaf Area Index, Land Surface Temperature, soil moisture, etc.) on the status and evolution of land surface at global scale.');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('agroecological_zones', 'Agroecological zones', 'The Food and Agriculture Organization of the United Nations (FAO) and the International Institute for Applied Systems Analysis (IIASA) have cooperated over several decades to develop and implement the Agro-Ecological Zones (AEZ) modeling framework and databases. AEZ relies on well-established land evaluation principles to assess natural resources for finding suitable agricultural land utilization options. Compilation of an AEZ agro-climatic inventory using several climatic variables (e.g. temperature, precipitation, sunshine fraction, relative humidity) gives a <strong>general characterization of climatic resources, signifies their suitability for agricultural use and provides data and indicators related to climatic requirements of crop growth, development and yield formation. Source: © FAO, 2021. Global Agro-Ecological Zones v4');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('soil_groups', 'Soil Groups', 'This filter refers to the categories defined by the WRB, an international soil classification system developed by the IUSS. These groups classify soils based on their physical and chemical properties, providing a standardized framework for naming soils and creating legends for soil maps. FAO & IIASA. 2023. Harmonized World Soil Database version 2.0. Rome and Laxenburg.');
    `);
};

export const addRasterData = async (
  dsn: string,
  tifPath?: string,
  options?: {
    out?: string;
    outDir?: string;
    resolution?: number;
    extent?: string;
    schema?: string;
    dataset?: string;
    soilProperty?: string;
    layerFields?: {
      min_depth?: number | null;
      max_depth?: number | null;
      reference_period_start?: string | null;
      reference_period_stop?: string | null;
    };
  },
): Promise<RasterLayerEntity> => {
  const input = tifPath ?? path.join(__dirname, './assets/raster/sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2.tif');
  const out = options?.out ?? path.join(tmpdir(), `test_raster_${Date.now()}_cog.tif`);
  const scriptPath = path.join(__dirname, '../src/scripts/ingest_raster.sh');

  const args = [
    `-r ${options?.resolution ?? 250}`,
    `-e ${options?.extent ?? 'global'}`,
    `-d "${dsn}"`,
    `-s "${options?.schema ?? process.env.POSTGRES_SCHEMA}"`,
    `-o "${out}"`,
    options?.outDir ? `-O "${options?.outDir}"` : '',
    options?.dataset ? `-D "${options?.dataset}"` : '',
    options?.soilProperty ? `-P "${options?.soilProperty}"` : '',
    `"${path.resolve(input)}"`,
  ]
    .filter(Boolean)
    .join(' ');

  await execAsync(`bash "${scriptPath}" ${args}`);

  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(RasterLayerEntity);

  const entity = await repo.findOneOrFail({ where: { file: { file_path: out } }, relations: { file: true } });

  if (options?.layerFields && Object.keys(options.layerFields).length > 0) {
    Object.assign(entity, options.layerFields);
    await repo.save(entity);
  }

  return entity;
};
