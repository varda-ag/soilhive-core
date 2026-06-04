import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Job } from 'pg-boss';
import { ExportJob } from '../../interfaces/Job';
import { EXPORT_CONFIG, FileFormat } from './types';
import { getEntityManager } from '../../utils/data-source';
import { getTotalRecordsCount, createReadmeFile, fetchBatch, groupByProperty } from './exportHelpers';
import { getPgBoss, PG_BOSS_SCHEMA } from '../../services/PgBoss';
import { GeoFileWriter } from './GeoFileWriter';
import { cleanupTempFiles, generateDownloadFilename, generateDownloadPath, moveToDownloadFolder, zipFiles } from './storageHelpers';
import EntitlementService from '../../services/EntitlementService';
import { EVERYONE } from '../../constants/constants';
import { RequestData } from '../../interfaces/RequestData';
import { log } from '../../utils/logger';
import { getExportBatchSize } from '../../utils/utils';

export async function processExportJob(job: Job<ExportJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { created_by } = job as unknown as ExportJob;
  const { filter_id, format } = data;

  const file_format = parseFileFormat(format);
  const entityManager = await getEntityManager();
  const entitlementService = new EntitlementService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, created_by ?? EVERYONE);

  // Create temp working directory - fresh start on every run (handles pod eviction)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_CONFIG.TEMP_DIR_PREFIX));

  try {
    // Get total records for progress tracking
    const requestData = {
      entityManager,
      entitlements,
      token: { isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin },
    } as RequestData;
    const total_records_estimate = await getTotalRecordsCount(requestData, data);

    await updateJobState(jobId, {
      ...data,
      progress_percentage: 0,
      progress_description: 'Starting export...',
      total_records_estimate,
      total_records_processed: 0,
    });

    await createReadmeFile(requestData, tempDir, data);

    // Initialize writer
    const writer = new GeoFileWriter(file_format);

    let cursor: string | undefined = data.current_cursor ?? undefined;
    let totalRecordsProcessed = data.total_records_processed ?? 0;
    let wasCancelled = false;

    // --- Main batch processing loop ---
    while (true) {
      // Check if job was cancelled before processing next batch
      if (await isJobCancelled(jobId)) {
        wasCancelled = true;
        break;
      }

      // 1. Fetch batch
      const batch = await fetchBatch(requestData, data, cursor);

      if (!batch || batch.length === 0) {
        break;
      }

      // 2. Group batch records by property
      const grouped = groupByProperty(batch);

      // 3. Open writer for this batch
      await writer.openFile(tempDir);

      // 4. Write grouped records
      for (const [propertyKey, records] of Object.entries(grouped)) {
        await writer.setProperty(propertyKey);
        for (const record of records) {
          await writer.writeRecord(record);
        }
      }

      // 5. Close writer after batch
      await writer.closeFile();

      // 6. Update cursor and progress
      cursor = batch[batch.length - 1]?.cursor;
      totalRecordsProcessed += batch.length;

      const progress_percentage = total_records_estimate > 0 ? Math.round((totalRecordsProcessed / total_records_estimate) * 100) : 0;

      await updateJobState(jobId, {
        ...data,
        current_cursor: cursor ?? null,
        total_records_processed: totalRecordsProcessed,
        progress_percentage,
        progress_description: `Processed ${totalRecordsProcessed} records...`,
      });

      // If batch is smaller than page size, we've reached the end
      if (batch.length < getExportBatchSize()) {
        break;
      }
    }

    // --- Post-processing ---

    if (wasCancelled) return;

    // Zip temp directory contents
    const downloadPath = generateDownloadPath(filter_id);
    const localZipPath = path.join(os.tmpdir(), path.basename(downloadPath));
    await zipFiles(tempDir, localZipPath);

    // Move zip to download folder via storage engine
    const final_storage_path = await moveToDownloadFolder(localZipPath, downloadPath);

    // Update job state as completed
    await updateJobState(jobId, {
      ...data,
      progress_percentage: 100,
      progress_description: 'Export complete',
      current_cursor: cursor ?? null,
      total_records_processed: totalRecordsProcessed,
      download_path: final_storage_path,
      download_filename: generateDownloadFilename(),
    });
  } catch (error) {
    log.error(`Error processing export job ${jobId}:`, { error: error as any });
    throw error;
  } finally {
    // Always cleanup temp files, even on error
    await cleanupTempFiles(tempDir);
  }
}

function parseFileFormat(format: string): FileFormat {
  const valid = Object.values(FileFormat) as string[];
  if (!valid.includes(format)) {
    throw new Error(`Unsupported file format: ${format}`);
  }
  return format as FileFormat;
}

async function updateJobState(jobId: string, update: Partial<ExportJob>): Promise<void> {
  const boss = getPgBoss();
  const db = boss.getDb();
  await db.executeSql(`UPDATE ${PG_BOSS_SCHEMA}.job SET data = data || $1::jsonb WHERE id = $2 AND state = 'active'`, [
    JSON.stringify(update),
    jobId,
  ]);
}

async function isJobCancelled(jobId: string): Promise<boolean> {
  const boss = getPgBoss();
  const db = boss.getDb();
  const result = await db.executeSql(`SELECT state FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1`, [jobId]);
  return result.rows[0]?.state === 'cancelled';
}
