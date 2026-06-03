import { getEntityManager } from '../../utils/data-source';
import FileEntity from '../../entities/File';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileService from '../../services/FileService';
import { IngestionStatus } from '../../types/data';
import { log } from '../../utils/logger';

const ORPHAN_FILE_TTL_DAYS = 7;

export async function processOrphanFileCleanup(): Promise<void> {
  const entityManager = await getEntityManager();

  const orphanFiles = await entityManager
    .getRepository(FileEntity)
    .createQueryBuilder('f')
    .leftJoin(DatasetFileMappingEntity, 'dfm', 'dfm.file_id = f.id')
    .where('f.status = :status', { status: IngestionStatus.PENDING })
    .andWhere('dfm.id IS NULL')
    .andWhere(`f.created_at < NOW() - INTERVAL '${ORPHAN_FILE_TTL_DAYS} days'`)
    .getMany();

  if (orphanFiles.length === 0) {
    log.info('No orphan files to clean up');
    return;
  }

  log.info('Starting orphan file cleanup', { count: orphanFiles.length });

  const fileService = new FileService();
  let deleted = 0;
  let errors = 0;

  for (const file of orphanFiles) {
    try {
      try {
        await fileService.deleteFileFromStorage(file.file_path);
      } catch (storageError) {
        log.warn('Failed to delete orphan file from storage, proceeding with DB deletion', {
          file_id: file.id,
          file_path: file.file_path,
          error: storageError instanceof Error ? storageError.message : String(storageError),
        });
      }
      await entityManager.getRepository(FileEntity).delete({ id: file.id });
      deleted++;
    } catch (error) {
      errors++;
      log.error('Failed to clean up orphan file', {
        file_id: file.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info('Orphan file cleanup complete', { deleted, errors });
}
