import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import { IncomingHttpHeaders } from 'http';
import { app } from '../../src/app';
import { addRasterFilterMappings, addRasterFilters, getDataAdminToken, getUserToken } from '../helper';
import { getDataSource } from '../../src/utils/data-source';
import { getPgBoss, PG_BOSS_SCHEMA } from '../../src/services/PgBoss';
import { JobQueues } from '../../src/types/enums';
import { rasterFilterTables } from '../../src/utils/raster';
import { addDataMapping, addDataset, addDatasetFileMapping, addFile } from '../../src/utils/mock';
import FileEntity from '../../src/entities/File';
import RasterFilterEntity from '../../src/entities/RasterFilter';
import { RasterFileMetadata } from '../../src/interfaces/File';

const NEW_ID = 'test_new_filter';

const rasterMetadata = (bandCount: number): RasterFileMetadata => ({
  is_raster: true,
  size: [256, 256],
  band_count: bandCount,
  raster_bands: Array.from({ length: bandCount }, (_, i) => ({ band_number: i + 1, data_type: 'UInt16' })),
});

/** A raster File row. The route never reads its bytes: the install job does. */
const addRasterFile = async (name: string, bandCount = 1): Promise<FileEntity> => {
  const file = await addFile(name);
  const repo = (await getDataSource()).getRepository(FileEntity);
  await repo.update({ id: file.id }, { metadata: rasterMetadata(bandCount) });
  return repo.findOneByOrFail({ id: file.id });
};

/** A table standing in for an installed raster, plus the pixel values an install would have counted. */
const markInstalled = async (id: string, pixelValues: Record<string, number> | null = { '1': 10, '2': 20 }) => {
  const dataSource = await getDataSource();
  await dataSource.query(`CREATE TABLE IF NOT EXISTS "${id}" (rid int)`);
  await dataSource.getRepository(RasterFilterEntity).update({ id }, { pixel_values: pixelValues, file_id: null });
};

const dropFilterTables = async (id: string) => {
  const dataSource = await getDataSource();
  for (const table of rasterFilterTables(id)) {
    await dataSource.query(`DROP TABLE IF EXISTS "${table}"`);
  }
};

describe('Testing /raster-filters routes', () => {
  let dataAdminAuthHeader: IncomingHttpHeaders;
  let userAuthHeader: IncomingHttpHeaders;

  beforeAll(async () => {
    const token = await getDataAdminToken();
    dataAdminAuthHeader = { Authorization: `Bearer ${token}` };
    userAuthHeader = { Authorization: `Bearer ${getUserToken('plain-user-id', 'plain-user@example.com')}` };
    // Started without workers: an enqueued install stays queued and never runs here
    await getPgBoss().start();
    await getPgBoss().createQueue(JobQueues.RASTER_FILTER_INSTALL);
  });

  afterAll(async () => {
    await getPgBoss().stop({ graceful: false });
  });

  beforeEach(async () => {
    const dataSource = await getDataSource();
    // clearDatabase empties the fixture tables but keeps them, and a table is what makes a filter installed
    await dataSource.query('DROP TABLE IF EXISTS land_cover, soil_groups');
    await addRasterFilters();
    await dataSource.query(`DELETE FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1`, [JobQueues.RASTER_FILTER_INSTALL]);
  });

  afterEach(async () => {
    await dropFilterTables(NEW_ID);
  });

  describe('GET /raster-filters', () => {
    it('shows a caller that is not privileged only the active and enabled raster filters', async () => {
      const before = await request(app).get('/raster-filters');
      expect(before.statusCode).toBe(200);
      expect(before.body).toEqual([]);

      await addRasterFilterMappings();
      const after = await request(app).get('/raster-filters').set(userAuthHeader);
      expect(after.body.map((f: any) => f.id).sort()).toEqual(['land_cover', 'soil_groups']);
      for (const filter of after.body) {
        expect(filter.enabled).toBe(true);
        expect(filter.active).toBe(true);
        expect(filter).not.toHaveProperty('install');
        expect(filter).not.toHaveProperty('pixel_values');
        expect(filter).not.toHaveProperty('created_by');
        expect(filter).not.toHaveProperty('file_id');
      }
    });

    it('shows a privileged caller every raster filter with its install state', async () => {
      const res = await request(app).get('/raster-filters').set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(200);
      expect(res.body.map((f: any) => f.id).sort()).toEqual(['agroecological_zones', 'land_cover', 'soil_groups']);
      for (const filter of res.body) {
        expect(filter.enabled).toBe(false);
        expect(filter.kind).toBe('categorical');
        expect(filter.install).toEqual({ status: 'not_installed', job_id: null, errors: [] });
      }
    });

    it('reports an installed raster filter', async () => {
      await addRasterFilterMappings();
      const res = await request(app).get('/raster-filters/land_cover').set(dataAdminAuthHeader);
      expect(res.body.install.status).toBe('installed');
      expect(res.body.enabled).toBe(true);
    });
  });

  describe('GET /raster-filters/:rasterFilterId', () => {
    it('is not found for a caller that is not privileged until the raster filter is enabled', async () => {
      expect((await request(app).get('/raster-filters/land_cover')).statusCode).toBe(404);
      await addRasterFilterMappings();
      const res = await request(app).get('/raster-filters/land_cover');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 'land_cover');
      expect(res.body).toHaveProperty('active', true);
    });

    it('responds to a privileged caller whatever the raster filter state', async () => {
      const res = await request(app).get('/raster-filters/land_cover').set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 'land_cover');
      expect(res.body.enabled).toBe(false);
    });

    it('responds with 404 if raster filter does not exist', async () => {
      const res = await request(app).get(`/raster-filters/non-existent-raster-filter`).set(dataAdminAuthHeader);
      expect(res.statusCode).toBe(404);
    });

    it.each(['land_cover', 'soil_groups'])('%s is enabled after adding mappings to it', async (filterId: string) => {
      const res = await request(app).get(`/raster-filters/${filterId}`).set(dataAdminAuthHeader);
      expect(res.body.enabled).toBeFalsy();
      await addRasterFilterMappings();
      const resAfter = await request(app).get(`/raster-filters/${filterId}`).set(dataAdminAuthHeader);
      expect(resAfter.body.enabled).toBeTruthy();
    });
  });

  describe('POST /raster-filters', () => {
    const payload = (fileId: string, overrides: Record<string, unknown> = {}) => ({
      id: NEW_ID,
      name: 'New filter',
      description: 'A test filter',
      file_id: fileId,
      band: 1,
      kind: 'categorical',
      ...overrides,
    });

    it('creates an inactive raster filter and queues its install', async () => {
      const file = await addRasterFile('new_filter.tif');
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug));
      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        id: NEW_ID,
        name: 'New filter',
        active: false,
        enabled: false,
        kind: 'categorical',
        mappings: null,
        file_id: file.slug,
        install: { status: 'queued', errors: [] },
      });

      const jobs = await (
        await getDataSource()
      ).query(`SELECT data FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1`, [JobQueues.RASTER_FILTER_INSTALL]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].data).toMatchObject({ raster_filter_id: NEW_ID, band: 1 });
      expect(res.body.install.job_id).toBeDefined();
    });

    it.each([
      ['an id that is not a table name', { id: 'Not-A-Table' }],
      ['an id too long for its overview tables', { id: `a${'b'.repeat(58)}` }],
      ['a continuous kind', { kind: 'continuous' }],
      ['mappings, which are labelled once installed', { mappings: { Forest: 1 } }],
      ['breaks, which are not supported yet', { breaks: [1, 2] }],
      ['a band below 1', { band: 0 }],
    ])('refuses %s with 400', async (_, overrides) => {
      const file = await addRasterFile('bad_payload.tif');
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug, overrides));
      expect(res.statusCode).toBe(400);
    });

    it('installs the only band of a single-band file when no band is given', async () => {
      const file = await addRasterFile('single_band.tif');
      const { band: _, ...withoutBand } = payload(file.slug);
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(withoutBand);
      expect(res.statusCode).toBe(201);
      const jobs = await (
        await getDataSource()
      ).query(`SELECT data FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1`, [JobQueues.RASTER_FILTER_INSTALL]);
      expect(jobs[0].data).toMatchObject({ raster_filter_id: NEW_ID, band: 1 });
    });

    it('requires a band for a multiband file', async () => {
      const file = await addRasterFile('no_band_chosen.tif', 2);
      const { band: _, ...withoutBand } = payload(file.slug);
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(withoutBand);
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('2 bands');
    });

    it('refuses a band the file does not have', async () => {
      const file = await addRasterFile('two_bands.tif', 2);
      const res = await request(app)
        .post('/raster-filters')
        .set(dataAdminAuthHeader)
        .send(payload(file.slug, { band: 3 }));
      expect(res.statusCode).toBe(400);
    });

    it('refuses a file that is not a raster', async () => {
      const file = await addFile('vector.csv');
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug));
      expect(res.statusCode).toBe(400);
    });

    it('refuses an id an existing raster filter has', async () => {
      const file = await addRasterFile('taken_id.tif');
      const res = await request(app)
        .post('/raster-filters')
        .set(dataAdminAuthHeader)
        .send(payload(file.slug, { id: 'land_cover' }));
      expect(res.statusCode).toBe(409);
    });

    it.each([['files'], [`o_8_${NEW_ID}`]])('refuses an id whose tables would collide with %s', async (existing: string) => {
      const dataSource = await getDataSource();
      if (existing !== 'files') {
        await dataSource.query(`CREATE TABLE "${existing}" (id int)`);
      }
      const file = await addRasterFile('collision.tif');
      const id = existing === 'files' ? 'files' : NEW_ID;
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug, { id }));
      expect(res.statusCode).toBe(409);
      expect(res.body.detail).toContain(existing);
    });

    it('refuses a file a dataset uses, since the install deletes it', async () => {
      const file = await addRasterFile('dataset_file.tif');
      const dataset = await addDataset('dataset-using-the-file', [0, 0, 1, 1]);
      const mapping = await addDataMapping({});
      await addDatasetFileMapping(dataset.id, mapping.id);
      await (await getDataSource()).query('UPDATE dataset_file_mappings SET file_id = $1 WHERE dataset_id = $2', [file.id, dataset.id]);
      const res = await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug));
      expect(res.statusCode).toBe(409);
    });

    it('refuses a file another raster filter is installing from', async () => {
      const file = await addRasterFile('shared_file.tif');
      expect((await request(app).post('/raster-filters').set(dataAdminAuthHeader).send(payload(file.slug))).statusCode).toBe(201);
      const res = await request(app)
        .post('/raster-filters')
        .set(dataAdminAuthHeader)
        .send(payload(file.slug, { id: 'test_other_filter' }));
      expect(res.statusCode).toBe(409);
    });

    it('requires the data-admin or super-admin scope', async () => {
      const file = await addRasterFile('forbidden.tif');
      expect((await request(app).post('/raster-filters').send(payload(file.slug))).statusCode).toBe(401);
      expect((await request(app).post('/raster-filters').set(userAuthHeader).send(payload(file.slug))).statusCode).toBe(403);
    });
  });

  describe('PATCH /raster-filters/:rasterFilterId', () => {
    it('sets active to false and persists the change', async () => {
      const res = await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: false });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('id', 'land_cover');
      expect(res.body.active).toBe(false);

      const getRes = await request(app).get('/raster-filters/land_cover').set(dataAdminAuthHeader);
      expect(getRes.body.active).toBe(false);
    });

    it('sets active back to true', async () => {
      await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: false });
      const res = await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({ active: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.active).toBe(true);
    });

    it('updates the name and description, and ignores fields it does not edit', async () => {
      const res = await request(app)
        .patch('/raster-filters/land_cover')
        .set(dataAdminAuthHeader)
        .send({ name: 'Land cover 2019', description: 'Renamed', mappings: { foo: 1 } });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Land cover 2019');
      expect(res.body.description).toBe('Renamed');
      expect(res.body.active).toBe(true);
      expect(res.body.mappings).toBeNull();
    });

    it('refuses an empty body', async () => {
      const res = await request(app).patch('/raster-filters/land_cover').set(dataAdminAuthHeader).send({});
      expect(res.statusCode).toBe(400);
    });

    it('responds with 404 if the raster filter does not exist', async () => {
      const res = await request(app).patch('/raster-filters/non-existent-raster-filter').set(dataAdminAuthHeader).send({ active: false });
      expect(res.statusCode).toBe(404);
    });

    it('responds with 401 without authorization', async () => {
      const res = await request(app).patch('/raster-filters/land_cover').send({ active: false });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /raster-filters/:rasterFilterId/mappings', () => {
    const put = (id: string, body: object) => request(app).put(`/raster-filters/${id}/mappings`).set(dataAdminAuthHeader).send(body);

    beforeEach(async () => {
      await (await getDataSource()).getRepository(RasterFilterEntity).save({ id: NEW_ID, name: 'New', description: '' });
    });

    it('refuses to label a raster filter that is not installed', async () => {
      expect((await put(NEW_ID, { Forest: 1 })).statusCode).toBe(409);
    });

    it('labels an installed raster filter, which enables it', async () => {
      await markInstalled(NEW_ID);
      const res = await put(NEW_ID, { Forest: 1, Grassland: 2 });
      expect(res.statusCode).toBe(200);
      expect(res.body.mappings).toEqual({ Forest: 1, Grassland: 2 });
      expect(res.body.enabled).toBe(true);
    });

    it('replaces the labels, and an empty object disables the raster filter', async () => {
      await markInstalled(NEW_ID);
      await put(NEW_ID, { Forest: 1, Grassland: 2 });
      expect((await put(NEW_ID, { Woodland: 1 })).body.mappings).toEqual({ Woodland: 1 });
      const res = await put(NEW_ID, {});
      expect(res.statusCode).toBe(200);
      expect(res.body.enabled).toBe(false);
    });

    it('refuses a value the raster does not hold', async () => {
      await markInstalled(NEW_ID);
      expect((await put(NEW_ID, { Forest: 1, Water: 3 })).statusCode).toBe(400);
    });

    it('accepts any value for a raster filter installed without recorded values', async () => {
      await markInstalled(NEW_ID, null);
      expect((await put(NEW_ID, { Water: 3 })).statusCode).toBe(200);
    });

    it('refuses two labels for one value', async () => {
      await markInstalled(NEW_ID);
      expect((await put(NEW_ID, { Forest: 1, Woodland: 1 })).statusCode).toBe(400);
    });

    it('refuses values that are not whole numbers', async () => {
      await markInstalled(NEW_ID);
      expect((await put(NEW_ID, { Forest: 1.5 })).statusCode).toBe(400);
    });
  });

  describe('DELETE /raster-filters/:rasterFilterId', () => {
    const del = (id: string) => request(app).delete(`/raster-filters/${id}`).set(dataAdminAuthHeader);

    beforeEach(async () => {
      await (await getDataSource()).getRepository(RasterFilterEntity).save({ id: NEW_ID, name: 'New', description: '' });
    });

    it('drops the tables and deletes the raster filter', async () => {
      const dataSource = await getDataSource();
      for (const table of rasterFilterTables(NEW_ID)) {
        await dataSource.query(`CREATE TABLE "${table}" (rid int)`);
      }
      expect((await del(NEW_ID)).statusCode).toBe(204);
      expect(await dataSource.getRepository(RasterFilterEntity).findOneBy({ id: NEW_ID })).toBeNull();
      const [{ count }] = await dataSource.query(`SELECT count(*)::int AS count FROM pg_class WHERE relname = ANY($1)`, [
        rasterFilterTables(NEW_ID),
      ]);
      expect(count).toBe(0);
    });

    it('deletes a raster filter that was never installed', async () => {
      expect((await del(NEW_ID)).statusCode).toBe(204);
    });

    it('refuses an active raster filter', async () => {
      await (await getDataSource()).getRepository(RasterFilterEntity).update({ id: NEW_ID }, { active: true });
      expect((await del(NEW_ID)).statusCode).toBe(409);
    });

    it('refuses a raster filter whose install is queued', async () => {
      await getPgBoss().send(
        JobQueues.RASTER_FILTER_INSTALL,
        { type: JobQueues.RASTER_FILTER_INSTALL, raster_filter_id: NEW_ID, band: 1 },
        { startAfter: 3600 },
      );
      expect((await del(NEW_ID)).statusCode).toBe(409);
    });

    it('frees the id for a new raster filter', async () => {
      await del(NEW_ID);
      const file = await addRasterFile('reused_id.tif');
      const res = await request(app)
        .post('/raster-filters')
        .set(dataAdminAuthHeader)
        .send({ id: NEW_ID, name: 'Again', description: '', file_id: file.slug, band: 1, kind: 'categorical' });
      expect(res.statusCode).toBe(201);
    });

    it('requires the data-admin or super-admin scope', async () => {
      expect((await request(app).delete(`/raster-filters/${NEW_ID}`).set(userAuthHeader)).statusCode).toBe(403);
    });
  });

  it('DELETE /files/:fileId refuses the source of a raster filter', async () => {
    const file = await addRasterFile('owned_by_filter.tif');
    await request(app)
      .post('/raster-filters')
      .set(dataAdminAuthHeader)
      .send({ id: NEW_ID, name: 'New', description: '', file_id: file.slug, band: 1, kind: 'categorical' });
    const res = await request(app).delete(`/files/${file.slug}`).set(dataAdminAuthHeader);
    expect(res.statusCode).toBe(409);
  });

  it('dataset file mappings refuse the source of a raster filter', async () => {
    const file = await addRasterFile('wanted_by_dataset.tif');
    const created = await request(app)
      .post('/raster-filters')
      .set(dataAdminAuthHeader)
      .send({ id: NEW_ID, name: 'New', description: '', file_id: file.slug, band: 1, kind: 'categorical' });
    expect(created.statusCode).toBe(201);
    const dataset = await addDataset('dataset-wanting-the-file', [0, 0, 1, 1]);

    const post = await request(app)
      .post(`/datasets/${dataset.slug}/dataset-file-mapping`)
      .set(dataAdminAuthHeader)
      .send({ fileID: file.slug });
    expect(post.statusCode).toBe(409);

    const mapping = await addDatasetFileMapping(dataset.id, (await addDataMapping({})).id);
    const patch = await request(app)
      .patch(`/datasets/${dataset.slug}/dataset-file-mapping/${mapping.id}`)
      .set(dataAdminAuthHeader)
      .send({ fileID: file.slug });
    expect(patch.statusCode).toBe(409);
  });
});
