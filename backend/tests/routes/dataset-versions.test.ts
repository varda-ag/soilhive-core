import { describe, expect, it, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { getPgBoss, initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import { JobQueues } from '../../src/types/enums';
import { getDataSource } from '../../src/utils/data-source';
import { sleep } from '../../src/utils/utils';
import { getDataAdminToken, getUserToken } from '../helper';
import * as VersionJobsModule from '../../src/jobs/version/VersionJobs';
import * as VersionPublishJobModule from '../../src/jobs/version/VersionPublishJob';
import { DATASET_LOCKING_QUEUES } from '../../src/data-layer/DatasetJobs';
import { requeueUnfinishedDiscards } from '../../src/jobs/orphan-cleanup/SweepOrphanRowsJob';
import { addDataset, addFile } from '../../src/utils/mock';
import { IngestionStatus } from '../../src/types/data';

describe('Testing /datasets/{datasetId}/versions routes', () => {
  beforeAll(async () => {
    const dataSource = await getDataSource();
    await dataSource?.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterEach(async () => {
    // Every test reuses the same slugs, and clearDatabase leaves pg-boss's jobs alone: a job a test leaves
    // queued or running would lock the next test's datasets, and run against them unmocked once its mock
    // is restored. Removed first, while the mocks still stand.
    const dataSource = await getDataSource();
    await dataSource.query(`DELETE FROM ${PG_BOSS_SCHEMA}.job WHERE state IN ('created', 'retry', 'active') AND name = ANY($1)`, [
      [...DATASET_LOCKING_QUEUES, JobQueues.SWEEP_ORPHAN_ROWS],
    ]);
    jest.restoreAllMocks();
    getPgBoss().clearSpies();
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  /** Waits for the job to reach the state, rather than for a fixed time: the worker polls for new jobs. */
  const waitForJobState = async (jobId: string, state: string): Promise<void> => {
    const dataSource = await getDataSource();
    for (let attempt = 0; attempt < 60; attempt++) {
      const [row] = await dataSource.query(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
      if (row?.state === state) return;
      await sleep(250);
    }
    throw new Error(`Job ${jobId} never reached ${state}`);
  };

  const openVersion = async (token: string, datasetSlug: string) =>
    request(app).post(`/datasets/${datasetSlug}/versions`).set('Authorization', `Bearer ${token}`).send();

  describe('POST /datasets/{datasetId}/versions', () => {
    it('opens a version, which names its dataset by id', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);

      const res = await openVersion(token, v1.slug);

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        id: 'route-survey-v2-increment',
        name: 'route-survey v2 increment',
        version_of: v1.slug,
        version_number: 2,
        status: IngestionStatus.PENDING,
        visibility: 'private',
      });
    });

    it('refuses a second open version with 409', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      await openVersion(token, v1.slug);

      const res = await openVersion(token, v1.slug);

      expect(res.statusCode).toBe(409);
      expect(res.body.detail).toContain('route-survey-v2-increment');
    });

    it('is refused to a non-admin caller', async () => {
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);

      const res = await openVersion(getUserToken('user-id', 'user@example.com'), v1.slug);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('reading a version', () => {
    it('is left out of GET /datasets and shown as pending_version', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      const res = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.map((d: { id: string }) => d.id)).toEqual([v1.slug]);
      expect(res.body[0].pending_version).toEqual({
        slug: 'route-survey-v2-increment',
        name: 'route-survey v2 increment',
        number: 2,
        status: IngestionStatus.PENDING,
        updated_at: v2.updated_at,
        queued_job: null,
        active_job: null,
        publishing: false,
      });

      // It's the version's own updated_at, which the child row shows, and it follows the version's changes.
      // Compared with the version's own response, not a literal: the column has no time zone, so it's read back
      // in the machine's
      const dataSource = await getDataSource();
      await dataSource.query(`UPDATE datasets SET updated_at = updated_at - interval '1 day' WHERE slug = $1`, [v2.id]);
      const after = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);
      const { body: version } = await request(app).get(`/datasets/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(after.body[0].pending_version.updated_at).toBe(version.updated_at);
      expect(after.body[0].pending_version.updated_at).not.toBe(v2.updated_at);
      expect(after.body[0].pending_version.updated_at).not.toBe(after.body[0].updated_at);
    });

    it('is not found by an anonymous caller', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      const res = await request(app).get(`/datasets/${v2.id}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('refusals', () => {
    it('refuses a load into a version that deletes its source files with 400', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      for (const type of [JobQueues.BULK_LOAD, JobQueues.RASTER_LOAD]) {
        const res = await request(app)
          .post('/jobs')
          .set('Authorization', `Bearer ${token}`)
          .send({ type, dataset_id: v2.id, delete_source_files: true });
        expect(res.statusCode).toBe(400);
        expect(res.body.detail).toContain('delete_source_files');
      }
    });

    it('refuses deleting a version, or a dataset with an open version, with 409', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      for (const slug of [v1.slug, v2.id]) {
        const direct = await request(app).delete(`/datasets/${slug}`).set('Authorization', `Bearer ${token}`);
        expect(direct.statusCode).toBe(409);
        const purge = await request(app)
          .post('/jobs')
          .set('Authorization', `Bearer ${token}`)
          .send({ type: JobQueues.BULK_DELETE, dataset_id: slug });
        expect(purge.statusCode).toBe(409);
      }
    });

    it('refuses publishing a version through PATCH with 409', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      const res = await request(app)
        .patch(`/datasets/${v2.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: IngestionStatus.PUBLISHED });

      expect(res.statusCode).toBe(409);
    });

    it("refuses changing a version's general information through PATCH with 409", async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      for (const change of [
        { name: 'renamed' },
        { description: 'edited' },
        { licenses: ['CC-BY-4.0'] },
        { preprocessing_steps: 'edited' },
      ]) {
        const res = await request(app).patch(`/datasets/${v2.id}`).set('Authorization', `Bearer ${token}`).send(change);
        expect(res.statusCode).toBe(409);
        expect(res.body.detail).toContain(Object.keys(change)[0]);
      }

      const { body: after } = await request(app).get(`/datasets/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(after).toMatchObject({ name: v2.name, description: v2.description ?? null });
    });

    it("accepts a version's general information sent unchanged", async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      const res = await request(app)
        .patch(`/datasets/${v2.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: v2.name, description: v2.description ?? null });

      expect(res.statusCode).toBe(200);
    });

    it('is 404 for a version of another dataset', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const other = await addDataset('other-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);

      const res = await request(app).delete(`/datasets/${other.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('reset and discard', () => {
    it('queue their job on the version, and lock it while it is unfinished', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);
      // Held, so the job stays running while the other requests are made
      let release!: () => void;
      const held = new Promise<void>(resolve => (release = resolve));
      const resetSpy = jest.spyOn(VersionJobsModule, 'processVersionReset').mockImplementation(() => held);

      const reset = await request(app).post(`/datasets/${v1.slug}/versions/${v2.id}/reset`).set('Authorization', `Bearer ${token}`);
      expect(reset.statusCode).toBe(202);
      expect(reset.body).toMatchObject({ queue: JobQueues.VERSION_RESET, data: { dataset_id: v2.id } });

      const discard = await request(app).delete(`/datasets/${v1.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(discard.statusCode).toBe(409);
      const load = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: JobQueues.BULK_LOAD, dataset_id: v2.id });
      expect(load.statusCode).toBe(409);

      const listed = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);
      const job = listed.body[0].pending_version.queued_job ?? listed.body[0].pending_version.active_job;
      expect(job).toEqual({ id: reset.body.id, queue: JobQueues.VERSION_RESET });

      // The held processor is only reached once the worker picks the job up
      await waitForJobState(reset.body.id, 'active');
      expect(resetSpy).toHaveBeenCalled();
      release();
      await waitForJobState(reset.body.id, 'completed');
    });

    it('queues a version-discard', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);
      jest.spyOn(VersionJobsModule, 'processVersionDiscard').mockResolvedValue();

      const res = await request(app).delete(`/datasets/${v1.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({ queue: JobQueues.VERSION_DISCARD, data: { dataset_id: v2.id } });
    });

    it('hides a discarded version at once, and lets a new one be opened while the discard still runs', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);
      // Held, so the discard is still queued or running for the requests below
      let release!: () => void;
      const held = new Promise<void>(resolve => (release = resolve));
      jest.spyOn(VersionJobsModule, 'processVersionDiscard').mockImplementation(() => held);

      const discard = await request(app).delete(`/datasets/${v1.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(discard.statusCode).toBe(202);

      const listed = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);
      expect(listed.body.find((d: { id: string }) => d.id === v1.slug).pending_version).toBeNull();
      const gone = await request(app).get(`/datasets/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(gone.statusCode).toBe(404);
      const again = await request(app).delete(`/datasets/${v1.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`);
      expect(again.statusCode).toBe(404);

      // Same name, since the discarded one no longer holds it; a suffixed slug, since slugs aren't reused
      const reopened = await openVersion(token, v1.slug);
      expect(reopened.statusCode).toBe(201);
      expect(reopened.body).toMatchObject({ name: v2.name, id: `${v2.id}-1`, version_number: v2.version_number });

      release();
      await sleep(500);
    });

    it('the orphan sweep queues again the discard of a version a failed discard left discarded', async () => {
      const token = await getDataAdminToken();
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);
      // Held, so the queued discard stays unfinished
      let release!: () => void;
      const held = new Promise<void>(resolve => (release = resolve));
      jest.spyOn(VersionJobsModule, 'processVersionDiscard').mockImplementation(() => held);
      const dataSource = await getDataSource();
      // As a failed discard leaves it when a new version was opened since: discarded, with no discard unfinished
      await dataSource.query(`UPDATE datasets SET status = 'ARCHIVED', deleted_at = now() WHERE slug = $1`, [v2.id]);
      const discardJobs = async (): Promise<number> =>
        Number(
          (
            await dataSource.query(`SELECT count(*) AS n FROM ${PG_BOSS_SCHEMA}.job WHERE name = $1 AND data->>'dataset_id' = $2`, [
              JobQueues.VERSION_DISCARD,
              v2.id,
            ])
          )[0].n,
        );

      expect(await requeueUnfinishedDiscards(dataSource.manager)).toBe(1);
      expect(await discardJobs()).toBe(1);
      // Its discard is now unfinished, so the next sweep leaves it alone
      expect(await requeueUnfinishedDiscards(dataSource.manager)).toBe(0);
      expect(await discardJobs()).toBe(1);

      release();
      await sleep(500);
    });
  });

  describe('POST /datasets/{datasetId}/versions/{versionId}/publish', () => {
    const publish = async (token: string, datasetSlug: string, versionSlug: string, body: object = {}) =>
      request(app).post(`/datasets/${datasetSlug}/versions/${versionSlug}/publish`).set('Authorization', `Bearer ${token}`).send(body);

    /** v1 with a LOADED version, ready to publish */
    const loadedVersion = async (token: string) => {
      const v1 = await addDataset('route-survey', [0, 0, 1, 1]);
      const { body: v2 } = await openVersion(token, v1.slug);
      await (await getDataSource()).query(`UPDATE datasets SET status = $2 WHERE slug = $1`, [v2.id, IngestionStatus.LOADED]);
      return { v1, v2 };
    };

    it('queues a version-publish that locks the dataset and the version, and shows as publishing until it ends', async () => {
      const token = await getDataAdminToken();
      const { v1, v2 } = await loadedVersion(token);
      // Held, so the publish stays unfinished for the requests below; then failed, to see it clear
      let fail!: (error: Error) => void;
      const held = new Promise<void>((_resolve, reject) => (fail = reject));
      jest.spyOn(VersionPublishJobModule, 'processVersionPublish').mockImplementation(() => held);

      const res = await publish(token, v1.slug, v2.id, { visibility: 'private', entitlements: { 'reader@example.com': ['preview'] } });

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({
        queue: JobQueues.VERSION_PUBLISH,
        data: {
          dataset_id: v1.slug,
          version_id: v2.id,
          visibility: 'private',
          entitlements: { 'reader@example.com': ['preview'] },
        },
      });
      const listed = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);
      expect(listed.body[0].pending_version.publishing).toBe(true);
      // The publish locks the dataset, but it's the version's work: the dataset isn't shown as queued
      expect(listed.body[0].queued_job).toBeNull();
      expect(listed.body[0].status).toBe(IngestionStatus.PUBLISHED);

      // Every job on the version, and a second publish, wait for it
      const refused = [
        await publish(token, v1.slug, v2.id),
        await request(app).post(`/datasets/${v1.slug}/versions/${v2.id}/reset`).set('Authorization', `Bearer ${token}`),
        await request(app).delete(`/datasets/${v1.slug}/versions/${v2.id}`).set('Authorization', `Bearer ${token}`),
        await request(app).post('/jobs').set('Authorization', `Bearer ${token}`).send({ type: JobQueues.BULK_LOAD, dataset_id: v2.id }),
      ];
      expect(refused.map(r => r.statusCode)).toEqual([409, 409, 409, 409]);
      // A discard refused leaves the version where it was
      expect((await request(app).get(`/datasets/${v2.id}`).set('Authorization', `Bearer ${token}`)).statusCode).toBe(200);

      // Only a job the worker has picked up reaches the mock, so it can be made to fail
      await waitForJobState(res.body.id, 'active');
      fail(new Error('publish failed'));
      await waitForJobState(res.body.id, 'failed');

      const after = await request(app).get('/datasets').set('Authorization', `Bearer ${token}`);
      expect(after.body[0].pending_version).toMatchObject({ slug: v2.id, publishing: false, status: IngestionStatus.LOADED });
      // Its error is the version's, where it's published from
      const errors = await request(app).get('/errors/datasets').set('Authorization', `Bearer ${token}`);
      const slugs = errors.body.map((e: { dataset_id: string }) => e.dataset_id);
      expect(slugs).toContain(v2.id);
      expect(slugs).not.toContain(v1.slug);
    });

    it.each([
      ['the version has no loaded data', IngestionStatus.PENDING, null],
      ['the version has files not loaded yet', IngestionStatus.LOADED, IngestionStatus.STAGED],
    ])('is refused with 409 when %s', async (reason, versionStatus, fileStatus) => {
      const token = await getDataAdminToken();
      const { v1, v2 } = await loadedVersion(token);
      const dataSource = await getDataSource();
      await dataSource.query(`UPDATE datasets SET status = $2 WHERE slug = $1`, [v2.id, versionStatus]);
      if (fileStatus) {
        const file = await addFile(`waiting-${v2.id}.csv`);
        await dataSource.query(`UPDATE files SET status = $2 WHERE id = $1`, [file.id, fileStatus]);
        await dataSource.query(`INSERT INTO dataset_file_mappings (dataset_id, file_id) SELECT id, $2 FROM datasets WHERE slug = $1`, [
          v2.id,
          file.id,
        ]);
      }

      const res = await publish(token, v1.slug, v2.id);

      expect(res.statusCode).toBe(409);
      expect(res.body.detail).toContain(reason);
    });

    it('is refused with 400 for a visibility or grant it does not know', async () => {
      const token = await getDataAdminToken();
      const { v1, v2 } = await loadedVersion(token);

      const bad = [
        await publish(token, v1.slug, v2.id, { visibility: 'secret' }),
        await publish(token, v1.slug, v2.id, { entitlements: { 'reader@example.com': ['everything'] } }),
        await publish(token, v1.slug, v2.id, { status: 'PUBLISHED' }),
      ];
      expect(bad.map(r => r.statusCode)).toEqual([400, 400, 400]);
    });

    it('is refused to a non-admin caller, and is 404 for a version of another dataset', async () => {
      const token = await getDataAdminToken();
      const { v1, v2 } = await loadedVersion(token);
      const other = await addDataset('other-survey', [0, 0, 1, 1]);

      expect((await publish(getUserToken('user-id', 'user@example.com'), v1.slug, v2.id)).statusCode).toBe(403);
      expect((await publish(token, other.slug, v2.id)).statusCode).toBe(404);
    });
  });
});
