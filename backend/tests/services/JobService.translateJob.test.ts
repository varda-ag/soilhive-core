import { describe, expect, it } from '@jest/globals';
import type { JobWithMetadata } from 'pg-boss';
import JobService from '../../src/services/JobService';
import type { Job } from '../../src/interfaces/Job';
import { translateJobError } from '../../src/errors/jobErrorMessages';
import { JobQueues } from '../../src/types/enums';

// translateJob is private, and deliberately so - it is an implementation detail of the two job
// reads. It is reached directly here because the alternative is a route test that has to plant a
// failed row in the pg-boss job table, and what needs guarding is one mapping, not the read path.
const translateJob = (job: Partial<JobWithMetadata<unknown>>): Job =>
  (new JobService() as any)['translateJob'](job as JobWithMetadata<unknown>);

// The shape pg-boss hands back, reduced to the fields translateJob reads. Defaults to a failed
// job, since that is the only state with anything to translate. `output` is left absent
// rather than null: pg-boss types it as `object`, and translateJob reads it through `?.`, which
// takes the two identically.
const jobRow = (overrides: Partial<JobWithMetadata<unknown>>): Partial<JobWithMetadata<unknown>> => ({
  id: 'job-1',
  name: JobQueues.EXPORT,
  state: 'failed',
  createdOn: new Date('2026-09-17T00:00:00Z'),
  completedOn: new Date('2026-09-17T00:01:00Z'),
  data: null,
  ...overrides,
});

const xlsxTooManyRecords = (params: Record<string, unknown>) =>
  jobRow({ data: { errors: [{ code: 'EX_XLSX_TOO_MANY_RECORDS', params }] } as any });

describe('JobService.translateJob', () => {
  it('folds the remedies of a JobError into the message', () => {
    // A Job has one field for a failure, and an Export is reachable through no other channel -
    // getDatasetErrors is keyed by dataset_id and an Export has none. A remedy the message does
    // not carry is a remedy the caller never sees.
    const job = translateJob(xlsxTooManyRecords({ record_count: '1,536,173', max_records: '300,000' }));

    expect(job.message).toContain('Your selection contains 1,536,173 records, more than the 300,000 Excel limit.');
    expect(job.message).toContain('Export as CSV or GeoPackage instead');
  });

  it('folds in every remedy, not only the first', () => {
    const params = { record_count: '400,000', max_records: '300,000' };
    const { actions } = translateJobError('EX_XLSX_TOO_MANY_RECORDS', params);
    const job = translateJob(xlsxTooManyRecords(params));

    expect(actions.length).toBeGreaterThan(1);
    for (const action of actions) {
      expect(job.message).toContain(action);
    }
  });

  it('interpolates params into the folded remedies, not just into the message', () => {
    const job = translateJob(xlsxTooManyRecords({ record_count: '400,000', max_records: '300,000' }));

    expect(job.message).not.toContain('{max_records}');
    expect(job.message).not.toContain('{record_count}');
  });

  it('leaves a queue reap message alone, having no remedy to fold', () => {
    const job = translateJob(jobRow({ output: { value: { message: 'job heartbeat timeout' } } as any }));

    expect(job.message).toBe('The job was interrupted before it could finish. Please try again.');
  });

  it('leaves a raw thrown error message alone', () => {
    const job = translateJob(jobRow({ output: { message: 'ENOENT: no such file or directory' } as any }));

    expect(job.message).toBe('ENOENT: no such file or directory');
  });

  // runJob writes data.errors while the job is still `active` and pg-boss moves the row to
  // `failed` only afterwards, so the two are briefly out of step. The state is what decides
  // whether there is a failure to report, never the presence of the errors - a job reported as
  // running must not carry a failure message. retryLimit is 0 on every queue, so this state
  // cannot be reached through the API today; it is reachable through the write window, and the
  // gate is what keeps it from mattering if retries are ever turned on.
  it.each(['active', 'created', 'retry', 'completed'] as const)('reports no message for a %s job carrying errors', state => {
    const job = translateJob(
      jobRow({
        state,
        data: { errors: [{ code: 'EX_XLSX_TOO_MANY_RECORDS', params: { record_count: '400,000', max_records: '300,000' } }] } as any,
      }),
    );

    expect(job.status).toBe(state);
    expect(job.message).toBeFalsy();
  });

  it('reports no message for a completed job whose output happens to carry one', () => {
    const job = translateJob(jobRow({ state: 'completed', output: { message: 'job timed out' } as any }));

    expect(job.message).toBeFalsy();
  });
});
