import { getEntityManager } from '../../utils/data-source';
import FileEntity from '../../entities/File';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import RasterLayerAssetEntity from '../../entities/RasterLayerAsset';
import RasterFilterEntity from '../../entities/RasterFilter';
import FileService from '../../services/FileService';
import { IngestionStatus } from '../../types/data';
import { getRawTableName } from '../../utils/utils';
import { log } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';
import { PG_BOSS_SCHEMA } from '../../services/PgBoss';
import { JobQueues } from '../../types/enums';

const ORPHAN_FILE_TTL_DAYS = 7;
const ORPHAN_STAGING_TABLE_TTL_DAYS = 1;

export async function processOrphanCleanup(): Promise<void> {
  const entityManager = await getEntityManager();
  await processOrphanFileCleanup(entityManager);
  await processOrphanStagingTableCleanup(entityManager);
  await processOrphanRasterFilterStagingCleanup(entityManager);
}

// Hard-deletes PENDING files older than ORPHAN_FILE_TTL_DAYS that have no DatasetFileMapping,
// i.e. files uploaded but never associated with a dataset and left dangling.
// Raster layer assets and the Files of Raster Filters awaiting installation are excluded from this
// cleanup. A Raster Filter's File is collected once the filter is deleted (docs/adr/0066).
async function processOrphanFileCleanup(entityManager: Awaited<ReturnType<typeof getEntityManager>>): Promise<void> {
  const orphanFiles = await entityManager
    .getRepository(FileEntity)
    .createQueryBuilder('f')
    .leftJoin(DatasetFileMappingEntity, 'dfm', 'dfm.file_id = f.id')
    .leftJoin(RasterLayerAssetEntity, 'rla', 'rla.file_id = f.id AND rla.deleted_at IS NULL')
    .leftJoin(RasterFilterEntity, 'rf', 'rf.file_id = f.id')
    .where('f.status = :status', { status: IngestionStatus.PENDING })
    .andWhere('dfm.id IS NULL')
    .andWhere('rla.id IS NULL')
    .andWhere('rf.id IS NULL')
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
        error: getErrorMessage(error),
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
        error: getErrorMessage(error),
      });
    }
  }

  log.info('Orphan staging table cleanup complete', { dropped, errors });
}

// Drops the staging tables (_rfi_<job id> and its o_<factor>__rfi_<job id> overviews) of Raster Filter
// installs that are no longer queued or running. A failed install drops its own; these are left by a
// worker that died mid-install (OOM kill, node eviction), which pg-boss reaps without running our code.
async function processOrphanRasterFilterStagingCleanup(entityManager: Awaited<ReturnType<typeof getEntityManager>>): Promise<void> {
  const schema = process.env.POSTGRES_SCHEMA!;
  const orphans: { table: string }[] = await entityManager.query(
    `SELECT c.relname AS table
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind = 'r'
       AND substring(c.relname FROM '^(?:o_[0-9]+_)?_rfi_([0-9a-f]{32})$') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM ${PG_BOSS_SCHEMA}.job j
         WHERE j.name = $2 AND j.state IN ('created', 'active')
           AND replace(j.id::text, '-', '') = substring(c.relname FROM '^(?:o_[0-9]+_)?_rfi_([0-9a-f]{32})$')
       )`,
    [schema, JobQueues.RASTER_FILTER_INSTALL],
  );

  if (orphans.length === 0) {
    log.info('No orphan raster filter staging tables to clean up');
    return;
  }

  let dropped = 0;
  let errors = 0;
  for (const { table } of orphans) {
    try {
      await entityManager.query(`DROP TABLE IF EXISTS "${schema}"."${table}"`);
      dropped++;
    } catch (error) {
      errors++;
      log.error('Failed to drop orphan raster filter staging table', { table, error: getErrorMessage(error) });
    }
  }

  log.info('Orphan raster filter staging table cleanup complete', { dropped, errors });
}
