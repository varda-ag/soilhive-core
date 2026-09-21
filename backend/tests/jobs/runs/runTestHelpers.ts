import * as fs from 'fs';
import * as path from 'path';
import { Job } from 'pg-boss';
import request from 'supertest';
import { Polygon } from 'geojson';
import { app } from '../../../src/app';
import { RunJobData } from '../../../src/interfaces/Job';
import { getPgBoss, PG_BOSS_SCHEMA } from '../../../src/services/PgBoss';
import { JobQueues } from '../../../src/types/enums';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { getPolygonFromBbox } from '../../../src/utils/geometry';
import { addFile } from '../../../src/utils/mock';
import FileEntity from '../../../src/entities/File';

/**
 * Fixtures shared by every suite that exercises a Run.
 *
 * They live here rather than in either queue's suite for the same reason RunContext does: a Data
 * Request and a Soil Index take the same spatial scope, so a fixture that builds one builds both.
 * Two copies of `addVectorFileWithGeometries` would be two things to keep in step with the file
 * metadata the extraction actually reads.
 */

export const storageRoot = process.env.LOCAL_STORAGE_ROOT_FOLDER!;
export const DATASET_BBOX = [-1, -1, 5, 5];
export const UNIT_A = getPolygonFromBbox([0, 0, 2, 2]);
export const UNIT_B = getPolygonFromBbox([2.5, 2.5, 4, 4]);

export const featureCollection = (features: { geometry: unknown; properties?: Record<string, unknown> }[]) => ({
  type: 'FeatureCollection',
  features: features.map(feature => ({ type: 'Feature', geometry: feature.geometry, properties: feature.properties ?? {} })),
});

/** Writes a vector file into local storage and registers it with vector metadata. */
export const addVectorFileWithGeometries = async (
  name: string,
  collection: object,
  options: { epsg?: number | undefined; fieldNames?: string[] } = {},
): Promise<FileEntity> => {
  const fileName = `${name}.geojson`;
  fs.writeFileSync(path.join(storageRoot, fileName), JSON.stringify(collection));

  const file = await addFile(fileName);
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository(FileEntity);
  await repo.update(file.id, {
    metadata: {
      is_raster: false,
      field_names: options.fieldNames ?? ['field_name'],
      detected_fields: {} as any,
      detected_mapping: {} as any,
      geometry_detected: true,
      driver: 'GeoJSON',
      ...(options.epsg === undefined ? {} : { epsg: options.epsg }),
    },
  });
  return await repo.findOneByOrFail({ id: file.id });
};

/**
 * pg-boss only accepts progress writes while a job is `active`, so the row is flipped
 * explicitly rather than racing a real worker — the progress assertions then become
 * deterministic.
 */
export const createActiveRunJob = async <T extends RunJobData>(
  queue: JobQueues,
  data: Partial<T>,
): Promise<{ jobId: string; job: Job<T> }> => {
  const payload = {
    type: queue,
    created_by: 'test-user',
    progress_percentage: 0,
    isDataAdmin: false,
    isSuperAdmin: false,
    ...data,
  } as T;

  const boss = getPgBoss();
  const jobId = (await boss.send(queue, payload))!;
  const entityManager = await getEntityManager();
  await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = 'active' WHERE id = $1`, [jobId]);

  return {
    jobId,
    job: {
      id: jobId,
      name: queue,
      data: payload,
      expireInSeconds: 3600,
      signal: AbortSignal.timeout(120000),
      heartbeatSeconds: 30,
    } as Job<T>,
  };
};

export const readJobData = async <T extends RunJobData>(jobId: string): Promise<T> => {
  const entityManager = await getEntityManager();
  const [row] = await entityManager.query(`SELECT data FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return row.data;
};

export const setJobState = async (jobId: string, state: string): Promise<void> => {
  const entityManager = await getEntityManager();
  await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = $2 WHERE id = $1`, [jobId, state]);
};

/** Creates a filter through the API so it is stored exactly as a client's would be. */
export const createFilter = async (geometries: Polygon[], parameters: object = {}): Promise<string> => {
  const response = await request(app).post('/data-filters').send({ geometries, parameters }).expect(201);
  return response.body.id;
};
