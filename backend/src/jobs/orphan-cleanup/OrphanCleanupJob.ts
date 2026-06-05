import { getEntityManager } from '../../utils/data-source';
import FileEntity from '../../entities/File';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import FileService from '../../services/FileService';
import { IngestionStatus } from '../../types/data';
import { getRawTableName } from '../../utils/utils';
import { log } from '../../utils/logger';

const ORPHAN_FILE_TTL_DAYS = 7;
const ORPHAN_STAGING_TABLE_TTL_DAYS = 1;

export async function processOrphanCleanup(): Promise<void> {
  const entityManager = await getEntityManager();
  await processOrphanFileCleanup(entityManager);
  await processOrphanStagingTableCleanup(entityManager);
}

// Hard-deletes PENDING files older than ORPHAN_FILE_TTL_DAYS that have no DatasetFileMapping,
// i.e. files uploaded but never associated with a dataset and left dangling.
async function processOrphanFileCleanup(entityManager: Awaited<ReturnType<typeof getEntityManager>>): Promise<void> {
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
      await fileService.deleteFileFromStorage(file.file_path);
      await entityManager.getRepository(FileEntity).delete({ id: file.id });
      deleted++;
    } catch (error) {
      errors++;
      log.error('Failed to clean up orphan file', {
        file_id: file.id,
        file_path: file.file_path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info('Orphan file cleanup complete', { deleted, errors });
}

// Drops staging tables (_raw_<file_id>) for STAGED files older than ORPHAN_STAGING_TABLE_TTL_DAYS
// that have no active DatasetFileMapping. Covers files removed mid-ingestion (soft-deleted or
// mapping hard-deleted) before the bulk-load job had a chance to clean them up.
async function processOrphanStagingTableCleanup(entityManager: Awaited<ReturnType<typeof getEntityManager>>): Promise<void> {
  const orphanStagedFiles = await entityManager
    .getRepository(FileEntity)
    .createQueryBuilder('f')
    .leftJoin(DatasetFileMappingEntity, 'dfm', 'dfm.file_id = f.id')
    .where('f.status = :status', { status: IngestionStatus.STAGED })
    .andWhere('dfm.id IS NULL')
    .andWhere(`f.created_at < NOW() - INTERVAL '${ORPHAN_STAGING_TABLE_TTL_DAYS} days'`)
    .withDeleted()
    .getMany();

  if (orphanStagedFiles.length === 0) {
    log.info('No orphan staging tables to clean up');
    return;
  }

  log.info('Starting orphan staging table cleanup', { count: orphanStagedFiles.length });

  let dropped = 0;
  let errors = 0;

  for (const file of orphanStagedFiles) {
    try {
      const tableName = getRawTableName(file.id);
      await entityManager.query(`DROP TABLE IF EXISTS "${process.env.POSTGRES_SCHEMA}"."${tableName}"`);
      dropped++;
    } catch (error) {
      errors++;
      log.error('Failed to drop orphan staging table', {
        file_id: file.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log.info('Orphan staging table cleanup complete', { dropped, errors });
}
