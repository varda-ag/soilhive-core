import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { getPgBoss, initPgBoss, PG_BOSS_SCHEMA, stopPgBoss } from '../../src/services/PgBoss';
import * as SoilExportJobModule from '../../src/jobs/soil-export/soilExportJob';
import { INTERRUPTION_MESSAGES, outputMessage } from '../../src/errors/jobErrorMessages';
import { JobQueues } from '../../src/types/enums';
import { getDataSource } from '../../src/utils/data-source';
import { sleep } from '../../src/utils/utils';

// docs/adr/0079: a job still running when the process stops is left to retry as an Interruption
describe('stopping pg-boss while a job runs', () => {
  beforeAll(async () => {
    const dataSource = await getDataSource();
    await dataSource.query(`DROP SCHEMA IF EXISTS ${PG_BOSS_SCHEMA} CASCADE;`);
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  // pg-boss fails the job twice: failWip with its shutdown message, then the aborted handler's settle
  // over it. Whichever lands last, the next Attempt must read it as an Interruption.
  it('leaves the job to retry, with an output read as an Interruption', async () => {
    // Never settles, like a long job cut off by a deploy
    jest.spyOn(SoilExportJobModule, 'processExportJob').mockImplementation(() => new Promise<void>(() => {}));
    const spy = getPgBoss().getSpy(JobQueues.EXPORT);
    const id = (await getPgBoss().send(JobQueues.EXPORT, { type: JobQueues.EXPORT }))!;
    await spy.waitForJobWithId(id, 'active');

    await stopPgBoss({ graceful: true, timeout: 1000 });

    const [row] = await (await getDataSource()).query(`SELECT state, output FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [id]);
    expect(row.state).toBe('retry');
    expect(INTERRUPTION_MESSAGES).toContain(outputMessage(row.output));
  });
});
