import FileService from '../../services/FileService';
import ErrorService from '../../services/ErrorService';
import { Job } from 'pg-boss';
import { FileToDbJob } from '../../interfaces/Job';
import { getEntityManager } from '../../utils/data-source';

export async function processFileToDb(job: Job<FileToDbJob>): Promise<void> {
  const { data } = job;
  const entityManager = await getEntityManager();
  if (data.dataset_id) {
    await new ErrorService().clearDatasetErrors(data.dataset_id, entityManager);
  }
  const fileService = new FileService();
  await fileService.fileToDB({ entityManager, entitlements: {} }, data.file_id);
}
