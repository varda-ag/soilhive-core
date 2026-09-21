import { Job } from 'pg-boss';
import { SoilIndexJob } from '../../interfaces/Job';
import { SoilIndexType } from '../../types/enums';
import { JobError } from '../../errors/JobError';
import { processRun, RunProduct } from '../runs/runContext';
import { runCreaIndex } from './creaIndex';

/**
 * The Soil Index Types this queue can compute.
 */
const INDEXES: Record<SoilIndexType, RunProduct<SoilIndexJob>> = {
  [SoilIndexType.CREA_INDEX]: { appliesRasterMask: false, run: runCreaIndex },
};

export async function processSoilIndex(job: Job<SoilIndexJob>): Promise<void> {
  return processRun(job, data => {
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
}
