import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import type { Job } from 'pg-boss';
import type { EntityManager } from 'typeorm';
import type { getEntityManager as GetEntityManager } from '../../src/utils/data-source';
import type { runJob as RunJob } from '../../src/services/PgBoss';

import { JobError } from '../../src/errors/JobError';
import { UNEXPECTED_JOB_ERROR_CODE } from '../../src/errors/jobErrorMessages';
import { JobQueues } from '../../src/types/enums';

// Only getEntityManager is stubbed: the shared beforeEach truncates the database through the real
// getDataSource, so replacing the whole module would break every test in the run.
jest.mock('../../src/utils/data-source', () => ({
  ...jest.requireActual<object>('../../src/utils/data-source'),
  getEntityManager: jest.fn(),
}));

const mockQuery = jest.fn<(sql: string, parameters?: unknown[]) => Promise<unknown>>();

// tests/jest.beforeEach.ts imports tests/helper, which imports src/app, which imports
// src/services/PgBoss — all before this file is evaluated. So PgBoss sits in the module registry
// already bound to the *real* getEntityManager, and the jest.mock above cannot reach it: runJob
// would write to the live pg-boss table and mockQuery would never see a call. Dropping the
// registry and re-requiring both together binds runJob to the mock we assert on.
let runJob: typeof RunJob;
let mockedGetEntityManager: jest.MockedFunction<typeof GetEntityManager>;

beforeAll(async () => {
  jest.resetModules();
  ({ runJob } = await import('../../src/services/PgBoss'));
  mockedGetEntityManager = jest.mocked((await import('../../src/utils/data-source')).getEntityManager);
});

// EXPORT rather than a raster or bulk queue: those trigger the cache-epoch bump and the DAI
// refresh in runJob's finally, neither of which this is about.
const queue = JobQueues.EXPORT;
const job = { id: 'job-1', name: 'export', data: {} } as unknown as Job<unknown>;

/** The error entries runJob wrote into the pg-boss row, or null when it wrote nothing. */
const writtenErrors = (): unknown[] | null => {
  const call = mockQuery.mock.calls[0];
  if (!call) return null;
  return JSON.parse(String((call[1] as unknown[])[0])).errors;
};

describe('runJob failure recording', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
    mockedGetEntityManager.mockReset();
    mockedGetEntityManager.mockResolvedValue({ query: mockQuery } as unknown as EntityManager);
  });

  it('records a JobError under its own code, for the dataset list to translate', async () => {
    await expect(
      runJob(queue, job, async () => {
        throw new JobError('RL_INVALID_BAND', { band: '5' }, 'the file has 2');
      }),
    ).rejects.toMatchObject({ name: 'JobError' });

    expect(writtenErrors()).toEqual([{ code: 'RL_INVALID_BAND', params: { band: '5' }, detail: 'the file has 2' }]);
  });

  it('records a failure that is not a JobError rather than dropping it', async () => {
    // A check-constraint violation as it arrives here. Recording only JobErrors is what made a
    // failed load silent: the processor still reset the dataset to PENDING, but ErrorService only
    // reports jobs carrying `data.errors`, so the list showed nothing at all. The code is unmapped
    // on purpose, so it translates to the fallback message with the raw text as its detail.
    await expect(
      runJob(queue, job, async () => {
        throw new Error('violates check constraint "chk_date_format_start"');
      }),
    ).rejects.toThrow('chk_date_format_start');

    expect(writtenErrors()).toEqual([
      { code: UNEXPECTED_JOB_ERROR_CODE, params: {}, detail: 'violates check constraint "chk_date_format_start"' },
    ]);
  });

  it('writes nothing when the job succeeds', async () => {
    await runJob(queue, job, async () => {});

    expect(writtenErrors()).toBeNull();
  });

  it('still fails the job with the original error when recording it fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection terminated'));

    await expect(
      runJob(queue, job, async () => {
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
  });
});
