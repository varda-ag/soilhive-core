import { Job } from 'pg-boss';
import { DataRequestJob } from '../../interfaces/Job';
import { StatisticsType } from '../../types/enums';
import { JobError } from '../../errors/JobError';
import { processRun, RunProduct } from '../runs/runContext';
import { runDescriptiveStatistics } from './descriptiveStatistics';

/**
 * The Statistics Types this queue can compute, and whether each masks by raster filters.
 *
 * One queue serves every Statistics Type rather than a queue per type. What they share is
 * everything that decides *which areas and which data* are in scope — the Filter, the Aggregation
 * Unit resolution and its cap, entitlement re-derivation, cancellation, progress — which is the
 * expensive, subtle half, and which now lives in the Run (see runContext). The cost accepted in
 * exchange: `job.data` holds fields only one type populates (see the DataRequestJob interface),
 * and a client must read `statistics_type` to know which output key to expect.
 *
 * Soil Indexes are the deliberate exception, and they left over cost rather than over meaning: one
 * of their Runs is long enough that sharing a queue starved the short ones behind it (ADR 0036).
 */
const PRODUCERS: Record<StatisticsType, RunProduct<DataRequestJob>> = {
  [StatisticsType.DESCRIPTIVE]: { appliesRasterMask: true, run: runDescriptiveStatistics },
};

export async function processDataRequest(job: Job<DataRequestJob>): Promise<void> {
  return processRun(job, data => {
    // Re-checked here even though the enqueue path validates it: a processor must not trust job data.
    const producer = data.statistics_type ? PRODUCERS[data.statistics_type] : undefined;
    if (!producer) {
      throw new JobError('DR_UNKNOWN_STATISTICS_TYPE', {
        statistics_type: data.statistics_type ?? '(absent)',
        supported: Object.keys(PRODUCERS).join(', '),
      });
    }
    return producer;
  });
}
