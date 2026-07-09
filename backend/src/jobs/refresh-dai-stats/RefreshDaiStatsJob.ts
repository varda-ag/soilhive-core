import { Job } from 'pg-boss';
import { refreshDaiStats } from '../../data-layer/DaiStats';
import { getEntityManager } from '../../utils/data-source';
import { RefreshDaiStatsJob } from '../../interfaces/Job';

export async function processRefreshDaiStats(job: Job<RefreshDaiStatsJob>): Promise<void> {
  const { data } = job;
  const entityManager = await getEntityManager();
  await refreshDaiStats(entityManager, data.dataset_ids);
}
