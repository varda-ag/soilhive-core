import FileService from '../../services/FileService';
import ErrorService from '../../services/ErrorService';
import { Job } from 'pg-boss';
import { LongStageJob } from '../../interfaces/Job';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import FileEntity from '../../entities/File';
import { EntityType } from '../../types/data';
import { JobQueues } from '../../types/enums';
import { hasActiveFileJob } from '../../data-layer/DatasetJobs';
import { JobError } from '../../errors/JobError';
import { assertNoBulkLoad } from '../file-to-db/FileToDbJob';

/**
 * Copies a long File into its long table (docs/adr/0081). Refused while the File is staged or its
 * Dataset loads: file-to-db pivots that table, and the Bulk Load drops it.
 */
export async function processLongStage(job: Job<LongStageJob>): Promise<void> {
  const { data } = job;
  const entityManager = await getEntityManager();
  if (data.dataset_id) {
    await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  }
  const requestData = { entityManager, entitlements: {} };
  const file = await getEntity(requestData, FileEntity, EntityType.FILE, data.file_id);
  if (await hasActiveFileJob(entityManager, JobQueues.FILE_TO_DB, file)) {
    throw new JobError('LS_FILE_STAGING', { file_name: file.name });
  }
  await assertNoBulkLoad(entityManager, file);
  await new FileService().longStage(requestData, data.file_id, data);
}
