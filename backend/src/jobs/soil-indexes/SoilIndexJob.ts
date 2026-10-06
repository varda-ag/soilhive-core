import { Job } from 'pg-boss';
import { SoilIndexJob, SoilIndexTilesJob } from '../../interfaces/Job';
import { JobQueues, SoilIndexType } from '../../types/enums';
import { JobError } from '../../errors/JobError';
import { processRun, RunProduct } from '../runs/runContext';
import { failureMessage } from '../runs/failureMessage';
import { runCreaIndex } from './creaIndex';
import { SoilIndexFeature } from './types';
import { writeSoilIndexRun } from '../../data-layer/SoilIndex';
import { insertFailedSoilIndexRun, lockLiveSoilIndexJob, toSoilIndexRunParameters } from '../../data-layer/SoilIndexRuns';
import { getJobCreatedOn, getPgBoss, updateJobState } from '../../services/PgBoss';
import { getEntityManager } from '../../utils/data-source';
import { getErrorMessage } from '../../utils/error';
import { log } from '../../utils/logger';

/**
 * The Soil Index Types this queue can compute. Each returns its Scored Geometries; storing them is
 * this queue's job, not the methodology's.
 */
const INDEXES: Record<SoilIndexType, RunProduct<SoilIndexJob, SoilIndexFeature[]>> = {
  [SoilIndexType.CREA_INDEX]: { appliesRasterMask: false, run: runCreaIndex },
};

/**
 * Runs a Soil Index and records its outcome: the single write site for `soil_index_runs`
 * (docs/adr/0044), as `processDataRequest` is for `data_requests`.
 *
 *  - Scores came back: they, the completed record and the tiling facts are written in one
 *    transaction, which first locks the job and writes nothing if a DELETE cancelled it.
 *  - It threw: record `failed`, then rethrow, so pg-boss still fails the job.
 *  - Nothing came back and nothing threw: the Run was cancelled, and leaves nothing.
 */
export async function processSoilIndex(job: Job<SoilIndexJob>): Promise<void> {
  const jobId = job.id;
  // The submission time, read before the Run in case its job is gone by the end.
  const createdAt = await getJobCreatedOn(jobId);
  const entityManager = await getEntityManager();

  let scored: number | null;
  try {
    const features = await processRun<SoilIndexJob, SoilIndexFeature[]>(job, data => {
      // Required rather than defaulted, and re-checked here even though the enqueue path validates
      // it: a processor must not trust job data, which outlives the request that produced it. There
      // is deliberately nothing to fall back to — see SoilIndexType.
      const index = data.soil_index_type ? INDEXES[data.soil_index_type] : undefined;
      if (!index) {
        throw new JobError('SI_UNKNOWN_INDEX_TYPE', {
          soil_index_type: data.soil_index_type ?? '(absent)',
          supported: Object.keys(INDEXES).join(', '),
        });
      }
      return index;
    });
    if (!features) {
      log.info('Soil index run cancelled, nothing written', { job_id: jobId });
      return;
    }

    await updateJobState(jobId, {
      progress_percentage: 80,
      progress_description: `Storing ${features.length} score(s)...`,
    } as Partial<SoilIndexJob>);
    scored = await writeSoilIndexRun(entityManager, jobId, job.data.soil_index_type, features, {
      request: toSoilIndexRunParameters(job.data),
      createdAt,
      assertLive: transactionalEntityManager => lockLiveSoilIndexJob(transactionalEntityManager, jobId),
    });
  } catch (error) {
    // The failure the caller is told about must not be replaced by a failure to write it down.
    try {
      await insertFailedSoilIndexRun(entityManager, {
        id: jobId,
        request: toSoilIndexRunParameters(job.data),
        message: failureMessage(error),
        created_at: createdAt,
      });
    } catch (writeError) {
      log.error('Failed to record soil index run failure', { job_id: jobId, error: getErrorMessage(writeError) });
    }
    throw error;
  }

  if (scored === null) {
    log.info('Soil index run cancelled before storing, nothing written', { job_id: jobId });
    return;
  }

  // The scores go nowhere near job data: they are rows keyed by this job's id as the Run.
  await updateJobState(jobId, { progress_percentage: 100, progress_description: `Completed: ${scored} score(s)` } as Partial<SoilIndexJob>);
  log.info('Soil index run completed', { job_id: jobId, soil_index_type: job.data.soil_index_type, scores: scored });

  // Tiles are servable as soon as the partition is attached; pre-rendering only makes the heaviest
  // ones fast (docs/adr/0043), so failing to enqueue it must not fail a Run that is complete.
  try {
    const tilesJob: SoilIndexTilesJob = { run: jobId };
    await getPgBoss().send(JobQueues.SOIL_INDEX_TILES, tilesJob);
  } catch (error) {
    log.warn('Failed to enqueue soil index tile pre-rendering', { job_id: jobId, error: getErrorMessage(error) });
  }
}
