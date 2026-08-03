import { Job } from 'pg-boss';
import { SoilStatisticsJob } from '../../interfaces/Job';
import { RequestData } from '../../interfaces/RequestData';
import { getEntityManager } from '../../utils/data-source';
import { getPgBoss, PG_BOSS_SCHEMA, updateJobState } from '../../services/PgBoss';
import EntitlementService from '../../services/EntitlementService';
import FilterService from '../../services/FilterService';
import { EVERYONE } from '../../constants/constants';
import { StatisticsType } from '../../types/enums';
import { JobError } from '../../errors/JobError';
import { log } from '../../utils/logger';
import { ProducerContext } from './producer';
import { runDescriptiveStatistics } from './descriptiveStatistics';
import { runCreaIndex } from './creaIndex';

class JobCancelled extends Error {}

const isJobCancelled = async (jobId: string): Promise<boolean> => {
  const boss = getPgBoss();
  const result = await boss.getDb().executeSql(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return result.rows[0]?.state === 'cancelled';
};

const PRODUCERS: Record<StatisticsType, (ctx: ProducerContext, data: SoilStatisticsJob) => Promise<void>> = {
  [StatisticsType.DESCRIPTIVE]: runDescriptiveStatistics,
  [StatisticsType.CREA_INDEX]: runCreaIndex,
};

/**
 * Resolves the shared inputs of a soil-statistics run and hands off to the producer for its
 * Statistics Type.
 *
 * One queue serves every Statistics Type rather than a queue per type, even though the
 * types return incompatible shapes. What they share is everything that decides *which
 * areas and which data* are in scope — the Filter, the Aggregation Unit resolution and its
 * cap, entitlement re-derivation, cancellation, progress — and that is the expensive,
 * subtle half. A queue per type would duplicate it or force a shared library that is a
 * pipeline in all but name, and would make "the same areas, computed differently" look
 * like two unrelated features to every caller. The cost accepted in exchange: `job.data`
 * holds fields only one type populates (see the SoilStatisticsJob interface), and a client
 * must read `statistics_type` to know which output key to expect.
 *
 * Scope of the two inputs, which is easy to get backwards: `filter_id` always supplies
 * the criteria, and supplies the area of interest ONLY when `file_id` is absent. With a
 * file, its geometries become the Aggregation Units and the Filter's own geometries are
 * ignored — so a mandatory parameter is deliberately part-unused.
 *
 * Entitlements are re-derived here from EVERYONE plus the user's local rows, because a job
 * processor has no raw token and therefore cannot reach the external entitlements
 * endpoint; the authoritative check happens at enqueue time in JobService. What each
 * producer does with the result is its own business — see runDescriptiveStatistics.
 */
export async function processSoilStatistics(job: Job<SoilStatisticsJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { filter_id, created_by } = data;
  const statisticsType = data.statistics_type ?? StatisticsType.DESCRIPTIVE;

  // Re-checked even though the enqueue path validates it: a processor must not trust job
  // data, which outlives the request that produced it. Falling through to the descriptive
  // type would silently return the wrong product under a name the caller chose.
  const producer = PRODUCERS[statisticsType];
  if (!producer) {
    throw new JobError('SST_UNKNOWN_STATISTICS_TYPE', {
      statistics_type: statisticsType,
      supported: Object.keys(PRODUCERS).join(', '),
    });
  }

  const entityManager = await getEntityManager();
  const entitlementService = new EntitlementService();
  const filterService = new FilterService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as RequestData, created_by ?? EVERYONE);
  const requestData = {
    entityManager,
    entitlements,
    token: { sub: created_by ?? undefined, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin },
  } as RequestData;

  const assertNotCancelled = async () => {
    if (await isJobCancelled(jobId!)) {
      throw new JobCancelled();
    }
  };

  const report = async (description: string, percentage: number) => {
    await updateJobState(jobId!, { progress_percentage: percentage, progress_description: description } as Partial<SoilStatisticsJob>);
  };

  try {
    await report('Resolving area of interest...', 5);
    const filter = await filterService.getFilterById(requestData, filter_id);

    await producer({ jobId: jobId!, entityManager, requestData, filter, report, assertNotCancelled }, data);
  } catch (error) {
    if (error instanceof JobCancelled) {
      log.info('Soil statistics job cancelled', { job_id: jobId });
      return;
    }
    throw error;
  }
}
