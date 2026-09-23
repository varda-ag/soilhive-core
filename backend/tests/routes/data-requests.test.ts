import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import { DataRequestStatus, JobQueues, StatisticsType } from '../../src/types/enums';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { sleep } from '../../src/utils/utils';
import { getUserToken } from '../helper';
import { addDataset } from '../../src/utils/mock';
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
