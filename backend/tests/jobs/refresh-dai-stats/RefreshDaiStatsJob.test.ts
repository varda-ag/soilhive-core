import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { Job } from 'pg-boss';
import request from 'supertest';
import { app } from '../../../src/app';
import DatasetEntity from '../../../src/entities/Dataset';
import { RefreshDaiStatsJob } from '../../../src/interfaces/Job';
import { processRefreshDaiStats } from '../../../src/jobs/refresh-dai-stats/RefreshDaiStatsJob';
import { getPgBoss, initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../../src/services/PgBoss';
import { refreshDaiStats } from '../../../src/data-layer/DaiStats';
import { JobQueues } from '../../../src/types/enums';
import { getDataSource, getEntityManager } from '../../../src/utils/data-source';
import { addSyntheticData, syntheticDataOptions } from '../../../src/utils/mock';
import { sleep } from '../../../src/utils/utils';
import { getDataAdminToken } from '../../helper';

const getJob = (dataset_ids: string[]): Job<RefreshDaiStatsJob> => {
  return {
    id: 'mock-id',
    name: JobQueues.REFRESH_DAI_STATS,
    expireInSeconds: 60,
    signal: AbortSignal.timeout(10000),
    data: {
      type: JobQueues.REFRESH_DAI_STATS,
      created_by: 'test-user',
      progress_percentage: 0,
      dataset_ids,
      isDataAdmin: true,
      isSuperAdmin: false,
    },
    heartbeatSeconds: 10,
  };
};

const statsCount = async (): Promise<number> => {
  const entityManager = await getEntityManager();
  const [{ count }] = await entityManager.query('SELECT COUNT(*)::int AS count FROM feature_dai_stats');
  return count;
};

const statsRowFor = async (featureId: string) => {
  const entityManager = await getEntityManager();
  const rows = await entityManager.query(
    `SELECT num_soil_properties, num_props_below_30, num_dated_layers, num_distinct_years
     FROM feature_dai_stats WHERE feature_id = $1`,
    [featureId],
  );
  return rows[0];
};

describe('processRefreshDaiStats', () => {
  it('refreshes feature_dai_stats for the given dataset ids', async () => {
    const { dataset, features } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 1,
      featureCount: 2,
      featureCoordinates: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      depthLayers: 2,
      soilPropertyNames: ['prop_a'],
    });
    expect(await statsCount()).toBe(0);

    await processRefreshDaiStats(getJob([dataset.id]));

    expect(await statsCount()).toBe(2);
    const row = await statsRowFor(features![0]!.id);
    expect(row).toEqual({
      num_soil_properties: 1,
      num_props_below_30: 0, // Layers stop at 20cm depth
      num_dated_layers: 2,
      num_distinct_years: 1,
    });
  });

  it('prunes stats of a soft-deleted dataset without touching other datasets', async () => {
    const a = await addSyntheticData({ ...syntheticDataOptions, id: 1, featureCount: 1, featureCoordinates: [[0.1, 0.1]] });
    const b = await addSyntheticData({
      ...syntheticDataOptions,
      id: 2,
      featureCount: 1,
      featureCoordinates: [[0.2, 0.2]],
      soilPropertyNames: ['prop_b'],
    });
    await processRefreshDaiStats(getJob([a.dataset.id, b.dataset.id]));
    expect(await statsCount()).toBe(2);

    // Soft-delete A the same way DatasetService.deleteDataset does: dataset_layers
    // rows survive, so the scoped refresh can still resolve the affected features
    const repo = (await getDataSource()).getRepository(DatasetEntity);
    await repo.softRemove(await repo.findOneByOrFail({ id: a.dataset.id }));
    await processRefreshDaiStats(getJob([a.dataset.id]));

    expect(await statsCount()).toBe(1);
    expect(await statsRowFor(a.features![0]!.id)).toBeUndefined();
    expect(await statsRowFor(b.features![0]!.id)).toBeDefined();
  });
});

describe('async DAI refresh through the REFRESH_DAI_STATS queue', () => {
  beforeAll(async () => {
    // Drop pg-boss schema and recreate
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterEach(async () => {
    getPgBoss().clearSpies();
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  it('PATCH /datasets/:datasetId with a status change enqueues a refresh job that rebuilds the stats', async () => {
    const { dataset, features } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 1,
      featureCount: 1,
      featureCoordinates: [[0.1, 0.1]],
    });
    expect(await statsCount()).toBe(0);

    const token = await getDataAdminToken();
    const res = await request(app).patch(`/datasets/${dataset.slug}`).set('Authorization', `Bearer ${token}`).send({ status: 'PUBLISHED' });
    expect(res.statusCode).toBe(200);

    const spy = getPgBoss().getSpy<RefreshDaiStatsJob>(JobQueues.REFRESH_DAI_STATS);
    const job = await spy.waitForJob(data => data.dataset_ids?.includes(dataset.id), 'completed');
    expect(job.data.dataset_ids).toEqual([dataset.id]);

    expect(await statsCount()).toBe(1);
    expect(await statsRowFor(features![0]!.id)).toBeDefined();
  }, 20000);

  it('metadata-only PATCH does not enqueue a refresh job', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 1, featureCount: 1 });

    const token = await getDataAdminToken();
    const res = await request(app)
      .patch(`/datasets/${dataset.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ author: 'Updated Author' });
    expect(res.statusCode).toBe(200);

    const jobs = await getPgBoss().findJobs<RefreshDaiStatsJob>(JobQueues.REFRESH_DAI_STATS);
    expect(jobs.filter(j => j.data?.dataset_ids?.includes(dataset.id))).toHaveLength(0);
  });

  it('DELETE /datasets/:datasetId enqueues a refresh job that prunes the stats', async () => {
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, id: 1, featureCount: 1, featureCoordinates: [[0.1, 0.1]] });
    await refreshDaiStats(await getEntityManager(), [dataset.id]);
    expect(await statsCount()).toBe(1);

    const token = await getDataAdminToken();
    const res = await request(app).delete(`/datasets/${dataset.slug}`).set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(204);

    const spy = getPgBoss().getSpy<RefreshDaiStatsJob>(JobQueues.REFRESH_DAI_STATS);
    const job = await spy.waitForJob(data => data.dataset_ids?.includes(dataset.id), 'completed');
    expect(job.data.dataset_ids).toEqual([dataset.id]);

    expect(await statsCount()).toBe(0);
  }, 20000);
});
