import FileService from '../../services/FileService';
import { Job } from 'pg-boss';
import { FileToDbJob } from '../../interfaces/Job';
import { getEntityManager } from '../../utils/data-source';

export async function processFileToDb(job: Job<FileToDbJob>): Promise<void> {
  const { data } = job;
  // Using local entityManager to avoid external transaction
  const entityManager = await getEntityManager();
  const fileService = new FileService();
  await fileService.fileToDB({ entityManager }, data.file_id);
}
