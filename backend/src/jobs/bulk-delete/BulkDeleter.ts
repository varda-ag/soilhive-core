import { Job } from 'pg-boss';
import { QueryFailedError } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import { BulkDeleteJob } from '../../interfaces/Job';
import { Token } from '../../interfaces/Token';
import { RequestData } from '../../interfaces/RequestData';
import DatasetService from '../../services/DatasetService';
import DatasetEntity from '../../entities/Dataset';
import { getEntityManager } from '../../utils/data-source';
import { JobError } from '../../errors/JobError';
import { ErrorResponse } from '../../utils/error';
import { GISDataType, IngestionStatus } from '../../types/data';
import { deleteDatasetLayers, deleteRasterLayers } from '../../data-layer/DatasetRows';
import { queueOrphanSweep } from '../orphan-cleanup/SweepOrphanRowsJob';
import { refreshDaiStats } from '../../data-layer/DaiStats';
import { bumpCacheEpoch } from '../../utils/cache-epoch';
import ErrorService from '../../services/ErrorService';
import EntitlementService from '../../services/EntitlementService';
import { EntitlementScope } from '../../types/Entitlements';
import { updateJobState } from '../../services/PgBoss';

// Postgres: query_canceled — raised when a statement exceeds the `statement_timeout` set below.
const STATEMENT_TIMEOUT_CODE = '57014';

// previous_status: the Dataset's status before this job archived it, saved for a later Attempt (ADR 0079)
type BulkDeleteData = BulkDeleteJob & { previous_status?: IngestionStatus };

/**
 * A later Attempt's Dataset, archived now if the earlier Attempt was cut off before archiving it.
 * Looked up by its own slug with the deleted rows, never through slug history: a purged Dataset keeps its slug.
 */
const resumeArchive = async (
  requestData: RequestData,
  datasetService: DatasetService,
  slug: string,
  previous_status: IngestionStatus,
): Promise<DatasetEntity> => {
  const { entityManager } = requestData;
  const dataset = await entityManager.getRepository(DatasetEntity).findOne({ where: { slug }, withDeleted: true });
  if (!dataset) {
    throw new ErrorResponse(`Resource '${slug}' not found`, StatusCodes.NOT_FOUND);
  }
  if (dataset.deleted_at) {
    // Archived already, but its DAI refresh may have been cut off
    await refreshDaiStats(entityManager, [dataset.id]);
  } else {
    await datasetService.deleteDataset(requestData, slug, true);
  }
  // As it was before the first Attempt, so a failed purge puts that back
  dataset.status = previous_status;
  dataset.deleted_at = null;
  return dataset;
};

export async function processBulkDeletion(job: Job<BulkDeleteJob>): Promise<void> {
  const data: BulkDeleteData = job.data;
  const datasetService = new DatasetService();
  const entityManager = await getEntityManager();
  await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  const token = { sub: data.created_by, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin } as Token;
  const requestData = { entityManager, token, entitlements: {} };

  let dataset: DatasetEntity;
  if (data.previous_status) {
    dataset = await resumeArchive(requestData, datasetService, data.dataset_id, data.previous_status);
  } else {
    dataset = await datasetService.getDataset(requestData, data.dataset_id);
    // Saved before archiving, so a later Attempt knows this job archived the Dataset and what to put back
    await updateJobState(job.id, { previous_status: dataset.status });
    // First set dataset as deleted; the DAI refresh must be synchronous here so it
    // still sees the dataset_layers rows deleted below
    await datasetService.deleteDataset(requestData, data.dataset_id, true);
  }
  const datasetId = dataset.id;

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
