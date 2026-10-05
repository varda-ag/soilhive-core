import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../../src/app';
import { soilIndexPartition, soilIndexTilesPartition, writeSoilIndexRun } from '../../src/data-layer/SoilIndex';
import { prerenderSoilIndexTiles } from '../../src/data-layer/SoilIndexTiles';
import * as SoilIndexJobModule from '../../src/jobs/soil-indexes/SoilIndexJob';
import { initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import { SoilIndexType } from '../../src/types/enums';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { sleep } from '../../src/utils/utils';
import { getUserToken } from '../helper';

const IMMUTABLE = 'public, max-age=31536000, immutable';

const writeRun = async (): Promise<string> => {
  const run = uuidv4();
  await writeSoilIndexRun(await getEntityManager(), run, SoilIndexType.CREA_INDEX, [
    { type: 'Feature', id: uuidv4(), geometry: { type: 'Point', coordinates: [10.5, 45.5] }, properties: { value: 0.4, year: 2020 } },
  ]);
  return run;
};

describe('/soil-indexes/{runId}/tiles', () => {
  it('describes the tiles of a completed Run, with paths relative to the API base', async () => {
    const run = await writeRun();

    const res = await request(app).get(`/soil-indexes/${run}/tiles`).expect(200);

    expect(res.body).toEqual({
      tilejson: '3.0.0',
      tiles: [`/soil-indexes/${run}/tiles/1/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: 16,
      bounds: [10.5, 45.5, 10.5, 45.5],
      vector_layers: [
        {
          id: 'scores',
          minzoom: 0,
          maxzoom: 16,
          fields: { value: 'Number', year: 'Number', count: 'Number', min: 'Number', max: 'Number' },
        },
      ],
    });
    // Short-lived: the paths it lists change with the tiling version.
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });

  it('is 404 for an unknown Run', async () => {
    await request(app).get(`/soil-indexes/${uuidv4()}/tiles`).expect(404);
  });

  it('is 400 for a malformed Run id', async () => {
    await request(app).get('/soil-indexes/not-a-uuid/tiles').expect(400);
  });
});

describe('/soil-indexes/{runId}/tiles/{version}/{z}/{x}/{y}', () => {
  it('serves a tile holding scores as gzipped MVT, cached for good, with no token', async () => {
    const run = await writeRun();

    const res = await request(app).get(`/soil-indexes/${run}/tiles/1/0/0/0`).set('Accept-Encoding', 'gzip').expect(200);

    expect(res.headers['content-type']).toContain('application/vnd.mapbox-vector-tile');
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe(IMMUTABLE);
  });

  it('is 204 for a tile outside the Run, cached as well', async () => {
    const run = await writeRun();

    const res = await request(app).get(`/soil-indexes/${run}/tiles/1/2/0/3`).expect(204);
    expect(res.headers['cache-control']).toBe(IMMUTABLE);
  });

  it('is 404 for a tiling version no longer produced', async () => {
    const run = await writeRun();

    await request(app).get(`/soil-indexes/${run}/tiles/2/0/0/0`).expect(404);
  });

  it('is 404 for an unknown Run', async () => {
    await request(app).get(`/soil-indexes/${uuidv4()}/tiles/1/0/0/0`).expect(404);
  });

  it('is 400 for a tile that does not exist at its zoom, or a zoom above the maximum', async () => {
    const run = await writeRun();

    await request(app).get(`/soil-indexes/${run}/tiles/1/1/2/0`).expect(400);
    await request(app).get(`/soil-indexes/${run}/tiles/1/17/0/0`).expect(400);
  });
});

describe('/soil-indexes/{runId}/scores/{scoreId}', () => {
  it('reads one score with its metadata, cached for good', async () => {
    const run = await writeRun();

    const res = await request(app).get(`/soil-indexes/${run}/scores/1`).expect(200);

    expect(res.body).toEqual({ id: 1, value: 0.4, year: 2020, metadata: { unit_id: expect.any(String) } });
    expect(res.headers['cache-control']).toBe(IMMUTABLE);
  });

  it('is 404 for an unknown score', async () => {
    const run = await writeRun();

    await request(app).get(`/soil-indexes/${run}/scores/2`).expect(404);
  });
});

// ── The Run itself: POST, GET and DELETE (docs/adr/0044) ─────────────────────

const polygon = getPolygonFromBbox([10, 45, 11, 46]);

const createFilter = async (geometries: object[]): Promise<string> =>
  (await request(app).post('/data-filters').send({ geometries, parameters: {} }).expect(201)).body.id;

const submit = (body: object) => request(app).post('/soil-indexes').send(body);

const crea = async (extra: object = {}) => ({
  soil_index_type: SoilIndexType.CREA_INDEX,
  filter_id: await createFilter([polygon]),
  ...extra,
});

/**
 * Completes a Run by hand rather than by a worker, so the state under test is the point of the test
 * and not a race with one: marks the job completed and writes one score, its record and its tiles.
 */
const finishRun = async (id: string, configId?: string): Promise<void> => {
  const entityManager = await getEntityManager();
  await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = 'completed', completed_on = now() WHERE id = $1`, [id]);
  await writeSoilIndexRun(
    entityManager,
    id,
    SoilIndexType.CREA_INDEX,
    [{ type: 'Feature', id: uuidv4(), geometry: { type: 'Point', coordinates: [10.5, 45.5] }, properties: { value: 0.4, year: 2020 } }],
    {
      request: {
        soil_index_type: SoilIndexType.CREA_INDEX,
        filter_id: uuidv4(),
        ...(configId !== undefined ? { config_id: configId } : {}),
        derived_filter_id: null,
        unit_count: 1,
        units: [],
      },
    },
  );
  await prerenderSoilIndexTiles(entityManager, id, { minVertices: 0, maxTiles: 3 });
};

const tableExists = async (table: string): Promise<boolean> => {
  const [row] = await (
    await getEntityManager()
  ).query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`${process.env['POSTGRES_SCHEMA']}.${table}`]);
  return row.present;
};

describe('Soil Index Runs', () => {
  beforeAll(async () => {
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    // Workers complete submitted Runs at once and write nothing; finishRun does the rest.
    jest.spyOn(SoilIndexJobModule, 'processSoilIndex').mockResolvedValue(undefined);
    await initPgBoss();
    await sleep(2000);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await stopPgBoss();
  });

  describe('POST /soil-indexes', () => {
    it('accepts a Run without a token and reports it as pending, never with who asked', async () => {
      const body = await crea();
      const res = await submit(body)
        .set('Authorization', `Bearer ${getUserToken('si-user-id', 'si-user@example.com')}`)
        .expect(201);

      expect(res.body).toMatchObject({ status: 'pending', completed_at: null, message: null });
      expect(res.body.request).toMatchObject({ soil_index_type: SoilIndexType.CREA_INDEX, filter_id: body.filter_id });
      expect(JSON.stringify(res.body)).not.toMatch(/created_by|isDataAdmin|isSuperAdmin|si-user/);
      expect(res.body).not.toHaveProperty('data');
    });

    it('rejects a missing or unknown soil_index_type', async () => {
      const filterId = await createFilter([polygon]);

      expect(JSON.stringify((await submit({ filter_id: filterId }).expect(400)).body)).toContain('soil_index_type');
      await submit({ filter_id: filterId, soil_index_type: 'not-an-index' }).expect(400);
    });

    it('rejects a filter with no area of interest, an unknown filter, and label_field without a file', async () => {
      const res = await submit({ soil_index_type: SoilIndexType.CREA_INDEX, filter_id: await createFilter([]) }).expect(400);
      expect(res.body.detail).toContain('has no geometries');

      await submit({ soil_index_type: SoilIndexType.CREA_INDEX, filter_id: uuidv4() }).expect(404);
      await submit(await crea({ label_field: 'name' })).expect(400);
    });

    it('rejects a job type, which belongs to POST /jobs', async () => {
      await submit({ ...(await crea()), type: 'soil-indexes' }).expect(400);
    });
  });

  describe('GET /soil-indexes/{runId}', () => {
    it('reads a completed Run by anyone holding the id, with what it produced', async () => {
      const created = await submit(await crea()).expect(201);
      await finishRun(created.body.id);

      const res = await request(app).get(`/soil-indexes/${created.body.id}`).expect(200);

      expect(res.body).toMatchObject({
        id: created.body.id,
        status: 'completed',
        message: null,
        data: { score_count: 1, bounds: [10.5, 45.5, 10.5, 45.5], tiles: `/soil-indexes/${created.body.id}/tiles` },
      });
    });

    it('reads the record once the job is gone, without progress', async () => {
      const created = await submit(await crea()).expect(201);
      await finishRun(created.body.id);
      await (await getEntityManager()).query(`DELETE FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [created.body.id]);

      const res = await request(app).get(`/soil-indexes/${created.body.id}`).expect(200);

      expect(res.body.status).toBe('completed');
      expect(res.body.request.soil_index_type).toBe(SoilIndexType.CREA_INDEX);
      expect(res.body).not.toHaveProperty('progress_percentage');
    });

    it('is 404 for an unknown Run', async () => {
      await request(app).get(`/soil-indexes/${uuidv4()}`).expect(404);
    });
  });

  describe('DELETE /soil-indexes/{runId}', () => {
    it('destroys the record, the scores and the tiles together', async () => {
      const created = await submit(await crea()).expect(201);
      const id = created.body.id;
      await finishRun(id);
      expect(await tableExists(soilIndexTilesPartition(id))).toBe(true);

      await request(app).delete(`/soil-indexes/${id}`).expect(204);

      await request(app).get(`/soil-indexes/${id}`).expect(404);
      await request(app).get(`/soil-indexes/${id}/tiles`).expect(404);
      await request(app).get(`/soil-indexes/${id}/scores/1`).expect(404);
      expect(await tableExists(soilIndexPartition(id))).toBe(false);
      expect(await tableExists(soilIndexTilesPartition(id))).toBe(false);
      const jobs = await (await getEntityManager()).query(`SELECT id FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [id]);
      expect(jobs).toHaveLength(0);
    });

    it('is 404 for an unknown Run, so a repeated delete says it is gone', async () => {
      await request(app).delete(`/soil-indexes/${uuidv4()}`).expect(404);
    });
  });

  // docs/adr/0044: the config item gates the record and its destruction, never the scores.
  describe('attached to a config item', () => {
    const authorEmail = 'si-author@example.com';
    const readerEmail = 'si-reader@example.com';
    const author = () => getUserToken('si-author-id', authorEmail);
    const reader = () => getUserToken('si-reader-id', readerEmail);
    const stranger = () => getUserToken('si-stranger-id', 'si-stranger@example.com');

    const claimConfig = async (): Promise<string> => {
      const configId = `plugin:dashboards:dashboards:${uuidv4()}`;
      await request(app).put(`/configs/${configId}`).set('Authorization', `Bearer ${author()}`).send({ widgets: [] }).expect(200);
      await request(app)
        .put(`/configs/${configId}/entitlements`)
        .set('Authorization', `Bearer ${author()}`)
        .send({ [authorEmail]: ['write'], [readerEmail]: ['read'] })
        .expect(200);
      return configId;
    };

    const createAttached = async (configId: string) => {
      const res = await submit(await crea({ config_id: configId })).set('Authorization', `Bearer ${author()}`);
      expect(res.statusCode).toBe(201);
      return res.body.id as string;
    };

    it('records the config item, and refuses a caller with only read on it', async () => {
      const configId = await claimConfig();
      const id = await createAttached(configId);

      const res = await request(app).get(`/soil-indexes/${id}`).set('Authorization', `Bearer ${author()}`).expect(200);
      expect(res.body.request.config_id).toBe(configId);
      await submit(await crea({ config_id: configId }))
        .set('Authorization', `Bearer ${reader()}`)
        .expect(403);
      await submit(await crea({ config_id: 'theme' }))
        .set('Authorization', `Bearer ${author()}`)
        .expect(400);
    });

    it('gates the record by read, but leaves its scores and tiles to anyone holding the id', async () => {
      const configId = await claimConfig();
      const id = await createAttached(configId);
      await finishRun(id, configId);

      await request(app).get(`/soil-indexes/${id}`).set('Authorization', `Bearer ${reader()}`).expect(200);
      await request(app).get(`/soil-indexes/${id}`).set('Authorization', `Bearer ${stranger()}`).expect(403);
      await request(app).get(`/soil-indexes/${id}`).expect(403);

      await request(app).get(`/soil-indexes/${id}/tiles`).expect(200);
      await request(app).get(`/soil-indexes/${id}/scores/1`).expect(200);
    });

    it('takes write to destroy, and read alone leaves the Run standing', async () => {
      const configId = await claimConfig();
      const id = await createAttached(configId);
      await finishRun(id, configId);

      await request(app).delete(`/soil-indexes/${id}`).set('Authorization', `Bearer ${reader()}`).expect(403);
      await request(app).delete(`/soil-indexes/${id}`).expect(403);
      await request(app).get(`/soil-indexes/${id}/tiles`).expect(200);

      await request(app).delete(`/soil-indexes/${id}`).set('Authorization', `Bearer ${author()}`).expect(204);
      await request(app).get(`/soil-indexes/${id}`).set('Authorization', `Bearer ${author()}`).expect(404);
    });

    it('is destroyed with its config item, scores and tiles included, and nothing else is', async () => {
      const configId = await claimConfig();
      const pending = await createAttached(configId);
      const completed = await createAttached(configId);
      await finishRun(completed, configId);
      const unattached = (await submit(await crea()).expect(201)).body.id as string;
      await finishRun(unattached);

      await request(app).delete(`/configs/${configId}`).set('Authorization', `Bearer ${author()}`).expect(204);

      await request(app).get(`/soil-indexes/${pending}`).set('Authorization', `Bearer ${author()}`).expect(404);
      await request(app).get(`/soil-indexes/${completed}`).set('Authorization', `Bearer ${author()}`).expect(404);
      await request(app).get(`/soil-indexes/${completed}/tiles`).expect(404);
      expect(await tableExists(soilIndexPartition(completed))).toBe(false);
      expect(await tableExists(soilIndexTilesPartition(completed))).toBe(false);
      await request(app).get(`/soil-indexes/${unattached}`).expect(200);
    });
  });
});
