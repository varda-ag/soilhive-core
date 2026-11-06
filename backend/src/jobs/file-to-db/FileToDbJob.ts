import FileService from '../../services/FileService';
import ErrorService from '../../services/ErrorService';
import { Job } from 'pg-boss';
import { EntityManager } from 'typeorm';
import { FileToDbJob } from '../../interfaces/Job';
import { getEntityManager } from '../../utils/data-source';
import { getEntity } from '../../utils/slugs';
import FileEntity from '../../entities/File';
import { EntityType } from '../../types/data';
import { JobQueues } from '../../types/enums';
import { getActiveJob } from '../../data-layer/DatasetJobs';
import { JobError } from '../../errors/JobError';

export async function processFileToDb(job: Job<FileToDbJob>): Promise<void> {
  const { data } = job;
  const entityManager = await getEntityManager();
  if (data.dataset_id) {
    await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  }
  const requestData = { entityManager, entitlements: {} };
  await assertNoBulkLoad(requestData.entityManager, await getEntity(requestData, FileEntity, EntityType.FILE, data.file_id));
  const fileService = new FileService();
  await fileService.fileToDB(requestData, data.file_id);
}

/**
 * Refuses staging a File while a Bulk Load of one of its Datasets runs: recreating the raw table it
 * is reading would change what it loads, and its row-count check can't tell, since the loader counts
 * what it wrote. A check rather than a lock: file-to-db stays out of the Dataset locks (docs/adr/0042).
 */
const assertNoBulkLoad = async (entityManager: EntityManager, file: FileEntity): Promise<void> => {
  const datasets: { slug: string }[] = await entityManager.query(
    `SELECT DISTINCT d.slug FROM dataset_file_mappings dfm JOIN datasets d ON d.id = dfm.dataset_id WHERE dfm.file_id = $1`,
    [file.id],
  );
  const loading = await getActiveJob(
    entityManager,
    [JobQueues.BULK_LOAD],
    datasets.map(d => d.slug),
  );
  if (loading) {
    throw new JobError('FTD_DATASET_LOADING', { file_name: file.name });
  }
};
