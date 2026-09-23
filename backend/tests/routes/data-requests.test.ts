import { describe, expect, it, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import { DataRequestStatus, JobQueues, StatisticsType } from '../../src/types/enums';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { sleep } from '../../src/utils/utils';
import { getDataAdminToken, getUserToken } from '../helper';
import * as BulkLoaderModule from '../../src/jobs/bulk-load/BulkLoader';
import { addCategory, addDataset, addSoilProperty } from '../../src/utils/mock';
import { GISDataType } from '../../src/types/data';

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
};

const createFilter = async (geometries: object[], parameters: object = {}): Promise<string> => {
  const res = await request(app).post('/data-filters').send({ geometries, parameters }).expect(201);
  return res.body.id;
};

const submit = (body: object) => request(app).post('/data-requests').send(body);

describe('Testing /data-requests routes', () => {
  beforeAll(async () => {
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await stopPgBoss();
  });

  describe('POST /data-requests', () => {
    it('accepts a request without a token and reports it as pending', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId, histogram_bins: 20 });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe(DataRequestStatus.PENDING);
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.request.histogram_bins).toBe(20);
      expect(res.body.request.statistics_type).toBe(StatisticsType.DESCRIPTIVE);
      // Not yet computed, so no answer and no failure.
      expect(res.body.data).toBeUndefined();
      expect(res.body.message).toBeNull();
    });

    // The whole point of the representation: `job.data` carries these and a Data Request row has
    // no owner to scope a leak to, so they must not survive the mapping (docs/adr/0037).
    it('never returns the submitter, their privilege, or the queue', async () => {
      const filterId = await createFilter([polygon]);
      const token = getUserToken('dr-submitter-id', 'dr-submitter@example.com');
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain('created_by');
      expect(serialised).not.toContain('isDataAdmin');
      expect(serialised).not.toContain('isSuperAdmin');
      expect(serialised).not.toContain('dr-submitter@example.com');
      expect(res.body.queue).toBeUndefined();
    });

    it('rejects a request carrying a job type', async () => {
      const filterId = await createFilter([polygon]);
      // `type` was the /jobs discriminator and has no meaning here; the schema forbids extra
      // properties rather than silently ignoring one that used to select a queue.
      const res = await submit({ type: JobQueues.DATA_REQUESTS, statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId });
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown filter with 404', async () => {
      const res = await submit({
        statistics_type: StatisticsType.DESCRIPTIVE,
        filter_id: '960ee487-a6bd-4da8-8ef0-da6ef23d0e80',
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects a filter with no geometries when no file_id is given', async () => {
      const filterId = await createFilter([]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('no geometries');
    });

    it('rejects label_field without file_id', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId, label_field: 'field_name' });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('label_field requires file_id');
    });

    it('rejects a named dataset the caller cannot preview with 403', async () => {
      const dataset = await addDataset('private-dr-ds', [0, 0, 2, 2], GISDataType.POINT);
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE datasets SET visibility = 'private' WHERE id = $1`, [dataset.id]);

      const filterId = await createFilter([polygon]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId, dataset_ids: [dataset.slug] });
      expect(res.statusCode).toBe(403);
    });

    it('rejects a missing statistics_type', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ filter_id: filterId });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.body)).toContain('statistics_type');
    });

    it('rejects an unknown statistics_type', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ filter_id: filterId, statistics_type: 'not-a-type' });
      expect(res.statusCode).toBe(400);
    });

    // crea-index left this queue for soil-indexes (ADR 0036), so its old name is now simply an
    // unknown Statistics Type rather than a special case.
    it('rejects statistics_type crea-index, which is no longer a Statistics Type', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ filter_id: filterId, statistics_type: 'crea-index' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a histogram_bins value outside the allowed range', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId, histogram_bins: 1 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /data-requests — class-distribution', () => {
    const PH_CLASSES = [
      { name: 'Acid', max: 6.5 },
      { name: 'Neutral', min: 6.5, max: 7.5 },
      { name: 'Alkaline', min: 7.5 },
    ];

    let propertyCounter = 0;
    const addProperty = async () => {
      const category = await addCategory(`cd-route-cat-${propertyCounter}`);
      return addSoilProperty(`cd-route-ph-${propertyCounter++}`, category.id, 'pH');
    };

    const submitClassDistribution = async (overrides: Record<string, unknown> = {}, filterParameters: object = {}) => {
      const property = await addProperty();
      const filterId = await createFilter([polygon], filterParameters);
      return submit({
        statistics_type: StatisticsType.CLASS_DISTRIBUTION,
        filter_id: filterId,
        variable: { type: 'soil-property', id: property.slug },
        classes: PH_CLASSES,
        ...overrides,
      });
    };

    it('accepts a valid request and echoes every parameter back', async () => {
      const res = await submitClassDistribution({ time_aggregation: 3, depth_ranges: 'standard' });

      expect(res.statusCode).toBe(201);
      expect(res.body.request.statistics_type).toBe(StatisticsType.CLASS_DISTRIBUTION);
      expect(res.body.request.variable.type).toBe('soil-property');
      expect(res.body.request.classes).toEqual(PH_CLASSES);
      expect(res.body.request.time_aggregation).toBe(3);
      expect(res.body.request.depth_ranges).toBe('standard');
    });

    it('accepts a property the filter admits', async () => {
      const property = await addProperty();
      const filterId = await createFilter([polygon], { soil_properties: [property.slug] });
      const res = await submit({
        statistics_type: StatisticsType.CLASS_DISTRIBUTION,
        filter_id: filterId,
        variable: { type: 'soil-property', id: property.slug },
        classes: PH_CLASSES,
      });
      expect(res.statusCode).toBe(201);
    });

    // The variable narrows within the Filter and never widens it.
    it('rejects a property the filter excludes', async () => {
      const other = await addProperty();
      const res = await submitClassDistribution({}, { soil_properties: [other.slug] });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('is excluded by filter');
    });

    it('rejects a missing variable or missing classes', async () => {
      expect((await submitClassDistribution({ variable: undefined })).body.detail).toContain('variable is required');
      expect((await submitClassDistribution({ classes: undefined })).body.detail).toContain('classes is required');
    });

    it('rejects a variable that is not a soil property', async () => {
      expect((await submitClassDistribution({ variable: { type: 'soil-index', id: 'crea-index' } })).statusCode).toBe(400);
      const unknown = await submitClassDistribution({ variable: { type: 'soil-property', id: 'no-such-property' } });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.body.detail).toContain('is not a soil property');
    });

    it.each([
      [
        'overlapping classes',
        [
          { name: 'A', min: 0, max: 5 },
          { name: 'B', min: 4, max: 9 },
        ],
        'overlap',
      ],
      [
        'two classes open below',
        [
          { name: 'A', max: 5 },
          { name: 'B', max: 9 },
        ],
        'overlap',
      ],
      ['a class with no bound', [{ name: 'A' }], 'needs a min, a max, or both'],
      ['min not below max', [{ name: 'A', min: 5, max: 5 }], 'needs min below max'],
      [
        'a duplicate name',
        [
          { name: 'A', max: 5 },
          { name: 'A', min: 5 },
        ],
        'used more than once',
      ],
      ['the reserved name', [{ name: 'unclassified', min: 0 }], 'reserved'],
    ])('rejects %s', async (_label, classes, detail) => {
      const res = await submitClassDistribution({ classes });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain(detail);
    });

    it('accepts classes that touch without overlapping, in any order', async () => {
      const res = await submitClassDistribution({
        classes: [
          { name: 'High', min: 7.5 },
          { name: 'Low', max: 6.5 },
          { name: 'Mid', min: 6.5, max: 7.5 },
        ],
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects more than 20 classes and a time_aggregation outside 1-10', async () => {
      const many = Array.from({ length: 21 }, (_, i) => ({ name: `C${i}`, min: i, max: i + 1 }));
      expect((await submitClassDistribution({ classes: many })).statusCode).toBe(400);
      expect((await submitClassDistribution({ time_aggregation: 0 })).statusCode).toBe(400);
      expect((await submitClassDistribution({ time_aggregation: 11 })).statusCode).toBe(400);
      expect((await submitClassDistribution({ depth_ranges: 'harmonised' })).statusCode).toBe(400);
    });

    it('rejects histogram_bins, which is descriptive-only', async () => {
      const res = await submitClassDistribution({ histogram_bins: 10 });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('histogram_bins does not apply');
    });

    it('rejects class-distribution parameters sent with descriptive', async () => {
      const filterId = await createFilter([polygon]);
      const res = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId, time_aggregation: 2 });
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('time_aggregation does not apply');
    });
  });

  describe('GET /data-requests/{id}', () => {
    it('is readable without a token by anyone holding the id', async () => {
      const filterId = await createFilter([polygon]);
      const token = getUserToken('dr-owner-id', 'dr-owner@example.com');
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // No token at all, and a request submitted under someone else's: the id is the permission.
      const res = await request(app).get(`/data-requests/${created.body.id}`).expect(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.request.filter_id).toBe(filterId);
    });

    it('is readable by a bearer other than the submitter', async () => {
      const filterId = await createFilter([polygon]);
      const submitter = getUserToken('dr-a-id', 'dr-a@example.com');
      const stranger = getUserToken('dr-b-id', 'dr-b@example.com');
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${submitter}`)
        .expect(201);

      await request(app).get(`/data-requests/${created.body.id}`).set('Authorization', `Bearer ${stranger}`).expect(200);
    });

    it('returns 404 for an unknown id', async () => {
      await request(app).get('/data-requests/960ee487-a6bd-4da8-8ef0-da6ef23d0e80').expect(404);
    });
  });

  // One door: the same id must not be reachable through /jobs, where the rules contradict these
  // (ownership on read, cancel-without-destroy on delete) — docs/adr/0037.
  describe('the /jobs door is closed for this queue', () => {
    it('does not serve a data request through GET or DELETE /jobs/{jobId}', async () => {
      const filterId = await createFilter([polygon]);
      const token = getUserToken('dr-jobs-door-id', 'dr-jobs-door@example.com');
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // 404 and not 403: through that door the resource does not exist. Asserted with the
      // submitter's own token, so this is the queue rule and not the ownership one.
      await request(app).get(`/jobs/${created.body.id}`).set('Authorization', `Bearer ${token}`).expect(404);
      await request(app).delete(`/jobs/${created.body.id}`).set('Authorization', `Bearer ${token}`).expect(404);

      // And the request itself is untouched by the refused delete.
      await request(app).get(`/data-requests/${created.body.id}`).expect(200);
    });

    it('does not list a data request in GET /jobs, even to its submitter', async () => {
      jest.spyOn(BulkLoaderModule, 'processBulkLoad').mockResolvedValue(undefined);
      const filterId = await createFilter([polygon]);
      const token = await getDataAdminToken();
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // A job on a served queue from the same caller, so an empty list cannot pass for a filter
      // that dropped everything.
      const bulk = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: JobQueues.BULK_LOAD, dataset_id: 'dr-jobs-list-dataset' })
        .expect(201);

      const res = await request(app).get('/jobs').set('Authorization', `Bearer ${token}`).expect(200);
      const ids = res.body.map((job: { id: string }) => job.id);
      expect(ids).toContain(bulk.body.id);
      expect(ids).not.toContain(created.body.id);
      expect(res.body.some((job: { queue: string }) => job.queue === JobQueues.DATA_REQUESTS)).toBe(false);
    });
  });

  describe('DELETE /data-requests/{id}', () => {
    it('destroys a request without a token and makes it unreadable', async () => {
      const filterId = await createFilter([polygon]);
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId }).expect(201);

      await request(app).delete(`/data-requests/${created.body.id}`).expect(204);
      // Not "cancelled": the job survives in that state until retention, and reporting it would
      // keep answering for a resource the caller destroyed.
      await request(app).get(`/data-requests/${created.body.id}`).expect(404);
    });

    it('lets any bearer destroy it, including one who did not submit it', async () => {
      const filterId = await createFilter([polygon]);
      const submitter = getUserToken('dr-del-a-id', 'dr-del-a@example.com');
      const stranger = getUserToken('dr-del-b-id', 'dr-del-b@example.com');
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId })
        .set('Authorization', `Bearer ${submitter}`)
        .expect(201);

      await request(app).delete(`/data-requests/${created.body.id}`).set('Authorization', `Bearer ${stranger}`).expect(204);
      await request(app).get(`/data-requests/${created.body.id}`).expect(404);
    });

    it('returns 404 when there is neither a run nor a record', async () => {
      await request(app).delete('/data-requests/960ee487-a6bd-4da8-8ef0-da6ef23d0e80').expect(404);
    });

    it('returns 404 on a second delete', async () => {
      const filterId = await createFilter([polygon]);
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId }).expect(201);

      await request(app).delete(`/data-requests/${created.body.id}`).expect(204);
      await request(app).delete(`/data-requests/${created.body.id}`).expect(404);
    });

    /**
     * The case the tests above cannot reach, and the one where DELETE is easiest to get wrong.
     * Every other test here destroys a Run that is still cancellable; pg-boss's `cancel` only
     * updates jobs below `completed`, so on a Run that already finished it matches nothing and the
     * job goes on answering for a request the caller destroyed. The Run is driven to `completed`
     * by hand rather than by a worker so that the state under test is the point of the test, not a
     * race with one.
     */
    const finishRun = async (id: string): Promise<void> => {
      const entityManager = await getEntityManager();
      await entityManager.query(`UPDATE ${PG_BOSS_SCHEMA}.job SET state = 'completed', completed_on = now() WHERE id = $1`, [id]);
      await entityManager.query(
        `INSERT INTO data_requests ("id", "status", "request", "data", "message", "created_at", "completed_at")
         VALUES ($1, 'completed', $2::jsonb, $3::jsonb, NULL, now(), now())`,
        [
          id,
          JSON.stringify({ statistics_type: 'descriptive', filter_id: 'f', derived_filter_id: null, unit_count: 0, units: [] }),
          JSON.stringify({ results: [], truncated: false }),
        ],
      );
    };

    it('destroys a request whose run already completed', async () => {
      const filterId = await createFilter([polygon]);
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId }).expect(201);
      await finishRun(created.body.id);

      // Readable first, so the 404 below is this DELETE's doing and not a request that was never there.
      await request(app).get(`/data-requests/${created.body.id}`).expect(200);

      await request(app).delete(`/data-requests/${created.body.id}`).expect(204);
      await request(app).get(`/data-requests/${created.body.id}`).expect(404);
      await request(app).delete(`/data-requests/${created.body.id}`).expect(404);
    });

    it('leaves no job behind for a completed run it destroyed', async () => {
      const filterId = await createFilter([polygon]);
      const created = await submit({ statistics_type: StatisticsType.DESCRIPTIVE, filter_id: filterId }).expect(201);
      await finishRun(created.body.id);

      await request(app).delete(`/data-requests/${created.body.id}`).expect(204);

      // Not merely hidden: a terminated job cannot be cancelled, so the row itself is removed.
      // Left standing, it would also be the one thing that could resurrect the record.
      const entityManager = await getEntityManager();
      const rows = await entityManager.query(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [created.body.id]);
      expect(rows).toHaveLength(0);
    });
  });
});
