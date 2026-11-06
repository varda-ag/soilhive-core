import { Job } from 'pg-boss';
import { EntityManager, QueryFailedError } from 'typeorm';
import { FileStorage } from '@flystorage/file-storage';
import { VersionPublishJob } from '../../interfaces/Job';
import DatasetEntity from '../../entities/Dataset';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import { EntityType, GISDataType, IngestionStatus } from '../../types/data';
import { JobError } from '../../errors/JobError';
import { moveVersionRows, publishableReason } from '../../data-layer/DatasetVersions';
import { refreshDaiStats } from '../../data-layer/DaiStats';
import ErrorService from '../../services/ErrorService';
import EntitlementService from '../../services/EntitlementService';
import FileService from '../../services/FileService';
import { EntitlementScope } from '../../types/Entitlements';
import { jobRequestData } from '../jobRequestData';
import { updateDatasetMetadata } from '../bulk-load/UpdateDatasetMetadata';
import { updateRasterDatasetMetadata } from '../raster-load/UpdateDatasetMetadata';
import { deleteSourceFiles } from '../raster-load/RasterLoader';
import { getSubject } from '../../utils/auth';
import { log } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';

// Postgres: query_canceled — raised when a statement exceeds the `statement_timeout` set below.
const STATEMENT_TIMEOUT_CODE = '57014';

// bulk-delete's until Measure first sets it from the largest real increment (dataset-version-plan.md)
const PUBLISH_STATEMENT_TIMEOUT = '5min';

/**
 * Publishes a Version (v2) into the Dataset it is a version of (v1), in one transaction: v2's data
 * moves into v1 (moveVersionRows), v1 takes the publication settings, v2's version number and a new
 * data_updated_at, its metadata is rolled up again from its rows, and v2 is hard-deleted. v1 keeps
 * its id, slug and grants unless the settings replace them. v2's slug history stays, as for a
 * discard, so its slug is never reused.
 *
 * Readers see v1's old data until the transaction commits, and a failure publishes nothing: v2 stays
 * LOADED, with the job's error, and can be published again.
 */
export async function processVersionPublish(job: Job<VersionPublishJob>): Promise<void> {
  const { data } = job;
  const entityManager = await getEntityManager();
  // A publish's errors are the Version's, where it's published from (ErrorService)
  await new ErrorService().clearDatasetErrors(data.version_id, entityManager);
  const requestData = await jobRequestData(entityManager, data);
  const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, data.dataset_id);
  const version = await getEntity(requestData, DatasetEntity, EntityType.DATASET, data.version_id);
  const reason = await publishableReason(entityManager, dataset, version);
  if (reason) {
    throw new JobError('VERSION_NOT_PUBLISHABLE', { version_name: version.name, dataset_name: dataset.name, reason });
  }
  const updatedBy = data.created_by ? getSubject(requestData) : null;
  const isRaster = dataset.gis_datatype === GISDataType.RASTER;

  let fileIds: string[];
  try {
    fileIds = await entityManager.transaction(async manager => {
      await manager.query(`SET LOCAL statement_timeout = '${PUBLISH_STATEMENT_TIMEOUT}'`);
      const moved = await moveVersionRows(manager, dataset.id, version.id);

      // v2's grants go with it, as on a discard; v1's are replaced only when the settings carry them
      const managerRequestData = { ...requestData, entityManager: manager };
      const entitlementService = new EntitlementService();
      await entitlementService.deleteEntityEntitlements(managerRequestData, EntitlementScope.DATASETS, version.slug);
      if (data.entitlements) {
        await entitlementService.setEntityEntitlements(managerRequestData, EntitlementScope.DATASETS, dataset.slug, data.entitlements);
      }

      await manager.query(
        `UPDATE datasets v1
         SET version_number = v2.version_number,
             data_updated_at = now(),
             processing_steps = jsonb_set(
               COALESCE(v1.processing_steps, '{}'::jsonb),
               '{cleaning_steps}',
               COALESCE(v1.processing_steps->'cleaning_steps', '{}'::jsonb) || COALESCE(v2.processing_steps->'cleaning_steps', '{}'::jsonb)
             ),
             updated_by = COALESCE($3, v1.updated_by),
             updated_at = now()
         FROM datasets v2
         WHERE v1.id = $1 AND v2.id = $2`,
        [dataset.id, version.id, updatedBy],
      );
      // Through the repository: the column is the visibility_enum type, which a text parameter can't be compared with
      if (data.visibility) {
        await manager.getRepository(DatasetEntity).update({ id: dataset.id }, { visibility: data.visibility });
      }
      // Its slug history stays (see above)
      await manager.query(`DELETE FROM datasets WHERE id = $1`, [version.id]);

      // Last: recomputed from v1's rows as they now are, not by adding v2's rollup to v1's. Its own
      // statement_timeout outlasts the publish's, for the rest of the transaction.
      if (isRaster) {
        await updateRasterDatasetMetadata(manager, dataset.id, IngestionStatus.PUBLISHED, updatedBy);
      } else {
        await updateDatasetMetadata(manager, dataset.id, IngestionStatus.PUBLISHED);
      }
      return moved;
    });
  } catch (error) {
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === STATEMENT_TIMEOUT_CODE) {
      throw new JobError('VERSION_PUBLISH_TIMEOUT', { version_name: version.name, dataset_name: dataset.name });
    }
    throw error;
  }

  // Published: from here nothing may fail the job. The cache epoch is bumped by runJob.
  if (!isRaster) {
    await refreshDaiStats(entityManager, [dataset.id]).catch(error =>
      log.warn('Failed to refresh DAI stats after a version publish', { dataset_id: dataset.id, error: getErrorMessage(error) }),
    );
  }
  if (data.delete_source_files) {
    await deleteUploads(entityManager, fileIds, isRaster);
  }
}

/**
 * Deletes the uploads of a Version's Files, which its loads keep for a reset (JobService.lockDataset
 * refuses delete_source_files on them), as a load deletes them for a Dataset that isn't a version.
 * A raster File keeps the converted copy its layers read from, and loses only the original
 * (deleteSourceFiles). A vector File's upload goes; its raw table went when it was loaded.
 * Best-effort, as in the loads: the data is already published.
 */
const deleteUploads = async (entityManager: EntityManager, fileIds: string[], isRaster: boolean): Promise<void> => {
  if (isRaster) {
    await deleteSourceFiles(entityManager, fileIds);
    return;
  }
  if (fileIds.length === 0) {
    return;
  }
  const rows: { id: string; file_path: string }[] = await entityManager.query(
    `SELECT id, file_path FROM files WHERE id = ANY($1::uuid[])`,
    [fileIds],
  );
  const storage: FileStorage = FileService.getStorageEngine();
  for (const { id, file_path } of rows) {
    await storage
      .deleteFile(file_path)
      .catch(error => log.warn('Failed to delete source file after a version publish', { file_id: id, error: getErrorMessage(error) }));
  }
};
