import { Job } from 'pg-boss';
import { QueryFailedError } from 'typeorm';
import { BulkDeleteJob } from '../../interfaces/Job';
import { Token } from '../../interfaces/Token';
import DatasetService from '../../services/DatasetService';
import { getEntityManager } from '../../utils/data-source';
import { JobError } from '../../errors/JobError';
import { GISDataType } from '../../types/data';
import { deleteDatasetLayers, deleteRasterLayers } from '../../data-layer/DatasetRows';
import { queueOrphanSweep } from '../orphan-cleanup/SweepOrphanRowsJob';
import { refreshDaiStats } from '../../data-layer/DaiStats';
import { bumpCacheEpoch } from '../../utils/cache-epoch';
import ErrorService from '../../services/ErrorService';
import EntitlementService from '../../services/EntitlementService';
import { EntitlementScope } from '../../types/Entitlements';

// Postgres: query_canceled — raised when a statement exceeds the `statement_timeout` set below.
const STATEMENT_TIMEOUT_CODE = '57014';

export async function processBulkDeletion(job: Job<BulkDeleteJob>): Promise<void> {
  const { data } = job;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const token = { sub: data.created_by, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin } as Token;
  const requestData = { entityManager, token, entitlements: {} };
  const dataset = await datasetService.getDataset(requestData, data.dataset_id);
  const datasetId = dataset.id;

  // First set dataset as deleted; the DAI refresh must be synchronous here so it
  // still sees the dataset_layers rows deleted below
  await datasetService.deleteDataset(requestData, data.dataset_id, true);
  // Then, remove linked entities in a separate transaction
  try {
    await entityManager.transaction(async manager => {
      await manager.query(`SET LOCAL statement_timeout = '5min'`);

      // Entitlements to the dataset die with its data, not with the soft-deletion above: a
      // stripped jsonb key has no `deleted_at`, so it can only be undone by rolling back this
      // transaction. Above the data-type fork because it applies to both, and because the
      // raster branch returns early (ADR 0027).
      await new EntitlementService().deleteEntityEntitlements(
        { ...requestData, entityManager: manager },
        EntitlementScope.DATASETS,
        dataset.slug,
      );

      if (dataset.gis_datatype === GISDataType.RASTER) {
        await deleteRasterLayers(manager, datasetId);
        return;
      }
      // In chunks, with their observations by cascade. The features and layers they leave
      // unreferenced go to the orphan sweep queued below, which no concurrent load can fail
      await deleteDatasetLayers(manager, datasetId);
    });
  } catch (error) {
    // Roll back dataset status and soft-deletion, refresh DAI and invalidate cache
    await dataset.save();
    await refreshDaiStats(entityManager, [datasetId]);
    await bumpCacheEpoch();
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === STATEMENT_TIMEOUT_CODE) {
      throw new JobError('BD_TIMEOUT', { dataset_name: dataset.name });
    }
    throw error;
  }
  if (dataset.gis_datatype !== GISDataType.RASTER) {
    await queueOrphanSweep();
  }
}
