import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Job } from 'pg-boss';
import * as turf from '@turf/turf';
import { ExportJob, ExportOutputs } from '../../interfaces/Job';
import { EXPORT_CONFIG, VectorFileFormat, RasterFileFormat } from './types';
import { getEntityManager } from '../../utils/data-source';
import {
  getTotalRecordsCount,
  createReadmeFile,
  fetchBatch,
  groupByProperty,
  getTotalLayersCount,
  fetchRasterLayers,
  validateFileFormats,
  computeCombinedProgress,
} from './exportHelpers';
import { getPgBoss, PG_BOSS_SCHEMA } from '../../services/PgBoss';
import { GeoFileWriter } from './GeoFileWriter';
import { RasterFileWriter } from './RasterFileWriter';
import {
  cleanupTempFiles,
  generateDownloadFilename,
  generateDownloadPath,
  mergeGPKG,
  moveToDownloadFolder,
  zipFiles,
} from './storageHelpers';
import EntitlementService from '../../services/EntitlementService';
import { EVERYONE } from '../../constants/constants';
import { RequestData } from '../../interfaces/RequestData';
import { log } from '../../utils/logger';
import DatasetService from '../../services/DatasetService';
import FilterService from '../../services/FilterService';
import { GISDataType } from '../../types/data';
import { getExportBatchSize } from '../../utils/utils';

export async function processExportJob(job: Job<ExportJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { created_by } = job as unknown as ExportJob;
  const { filter_id, formats, dataset_ids } = data;

  const entityManager = await getEntityManager();
  const entitlementService = new EntitlementService();
  const entitlements = await entitlementService.getUserEntitlements({ entityManager } as any, created_by ?? EVERYONE);

  // Create temp working directory - fresh start on every run (handles pod eviction)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), EXPORT_CONFIG.TEMP_DIR_PREFIX));

  try {
    // Get total records and layers for progress tracking
    const requestData = {
      entityManager,
      entitlements,
      token: { isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin },
    } as RequestData;

    const datasetService = new DatasetService();
    const datasets = await Promise.all(dataset_ids.map(d => datasetService.getDataset(requestData, d)));
    const vectorDatasets = datasets.filter(d => d.gis_datatype && [GISDataType.POINT, GISDataType.POLYGONAL].includes(d.gis_datatype));
    const rasterDatasets = datasets.filter(d => d.gis_datatype === GISDataType.RASTER);
    const vectorRequested = vectorDatasets.length > 0;
    const rasterRequested = rasterDatasets.length > 0;

    const { vectorFormat, rasterFormat } = validateFileFormats(formats, vectorRequested, rasterRequested);

    const vectorData = { ...data, dataset_ids: vectorDatasets.map(d => d.slug) };
    const rasterData = { ...data, dataset_ids: rasterDatasets.map(d => d.slug) };

    const total_records_estimate = vectorRequested ? await getTotalRecordsCount(requestData, vectorData) : 0;
    const total_layers_estimate = rasterRequested ? await getTotalLayersCount(requestData, rasterData) : 0;

    // Calculate filter geometries' area for raster report tracking
    let aoi_area_km2: number | null = null;
    if (rasterRequested) {
      const filterService = new FilterService();
      const { geometries } = (await filterService.getFilterById(requestData, filter_id)).filter;
      aoi_area_km2 = turf.area(geometries[0]!) * 1e-6;
    }

    await updateJobState(jobId, {
      ...data,
      progress_percentage: 0,
      progress_description: 'Starting export...',
      total_records_estimate,
      total_records_processed: 0,
      total_layers_estimate,
      total_layers_processed: 0,
      aoi_area_km2,
    });

    await createReadmeFile(requestData, tempDir, data);

    const downloadPromises: Promise<Partial<ExportOutputs>>[] = [];

    if (vectorRequested && vectorFormat) {
      downloadPromises.push(exportVectorData(jobId, requestData, vectorData, vectorFormat, tempDir));
    }

    if (rasterRequested && rasterFormat) {
      downloadPromises.push(exportRasterData(jobId, requestData, rasterData, rasterFormat, tempDir));
    }

    const results = await Promise.all(downloadPromises);
    const totalRecordsProcessed = results.reduce((sum, r) => sum + (r.total_records_processed ?? 0), 0);
    const totalLayersProcessed = results.reduce((sum, r) => sum + (r.total_layers_processed ?? 0), 0);

    if (await isJobCancelled(jobId)) {
      return;
    }

    const needsFileMerge =
      (vectorRequested && rasterRequested && vectorFormat === rasterFormat) ||
      (rasterRequested && totalLayersProcessed > 1 && rasterFormat === RasterFileFormat.GPKG);
    if (needsFileMerge) {
      await mergeGPKG(tempDir);
    }
    const downloadPath = generateDownloadPath(filter_id);
    const localZipPath = path.join(os.tmpdir(), path.basename(downloadPath));
    await zipFiles(tempDir, localZipPath);

    const final_storage_path = await moveToDownloadFolder(localZipPath, downloadPath);

    await updateJobState(jobId, {
      ...data,
      progress_percentage: 100,
      progress_description: 'Export complete',
      current_cursor: null,
      total_records_processed: totalRecordsProcessed,
      total_layers_processed: totalLayersProcessed,
      download_path: final_storage_path,
      download_filename: generateDownloadFilename(),
    });
  } catch (error) {
    log.error(`Error processing export job ${jobId}:`, { error: error as any });
    throw error;
  } finally {
    await cleanupTempFiles(tempDir);
  }
}

async function exportVectorData(
  jobId: string,
  requestData: RequestData,
  data: any,
  fileFormat: VectorFileFormat,
  tempDir: string,
): Promise<Partial<ExportOutputs>> {
  if (!data.dataset_ids?.length) return { total_records_processed: 0 };

  const writer = new GeoFileWriter(fileFormat);

  let cursor: string | undefined = data.current_cursor ?? undefined;
  let totalRecordsProcessed = data.total_records_processed ?? 0;

  while (true) {
    if (await isJobCancelled(jobId)) break;

    const batch = await fetchBatch(requestData, data, cursor);
    if (!batch || batch.length === 0) break;

    const grouped = groupByProperty(batch);

    await writer.openFile(tempDir);

    for (const [propertyKey, records] of Object.entries(grouped)) {
      await writer.setProperty(propertyKey);
      for (const record of records) {
        await writer.writeRecord(record);
      }
    }

    await writer.closeFile();

    cursor = batch.at(-1)?.cursor;
    totalRecordsProcessed += batch.length;

    const stored_data = await getJobData(jobId);
    const progress_percentage = computeCombinedProgress(
      totalRecordsProcessed,
      stored_data.total_records_estimate,
      stored_data.total_layers_processed ?? 0,
      stored_data.total_layers_estimate,
      stored_data.aoi_area_km2,
    );
    const progress_description_vector = totalRecordsProcessed > 0 ? `${totalRecordsProcessed} records` : null;
    const progress_description_raster =
      (stored_data.total_layers_processed ?? 0) > 0 ? `${stored_data.total_layers_processed} raster_layers` : null;

    await updateJobState(jobId, {
      ...data,
      current_cursor: cursor ?? null,
      total_records_processed: totalRecordsProcessed,
      progress_percentage,
      progress_description: `Processed ${[progress_description_vector, progress_description_raster].filter(e => e !== null).join(' and ')}...`,
    });

    if (batch.length < getExportBatchSize()) break;
  }

  return { total_records_processed: totalRecordsProcessed };
}

async function exportRasterData(
  jobId: string,
  requestData: RequestData,
  data: any,
  fileFormat: RasterFileFormat,
  tempDir: string,
): Promise<Partial<ExportOutputs>> {
  if (!data.dataset_ids?.length) return { total_layers_processed: 0 };

  const { layers, aoi } = await fetchRasterLayers(requestData, data);

  if (!layers.length || !aoi) return { total_layers_processed: 0 };

  const writer = new RasterFileWriter(fileFormat, tempDir);
  let totalLayersProcessed = 0;

  for (const layer of layers) {
    if (await isJobCancelled(jobId)) break;

    await writer.writeLayer(layer, aoi);
    totalLayersProcessed++;

    const stored_data = await getJobData(jobId);
    const progress_percentage = computeCombinedProgress(
      stored_data.total_records_processed ?? 0,
      stored_data.total_records_estimate,
      totalLayersProcessed,
      stored_data.total_layers_estimate,
      stored_data.aoi_area_km2,
    );
    const progress_description_vector =
      (stored_data.total_records_processed ?? 0) > 0 ? `${stored_data.total_records_processed} records` : null;
    const progress_description_raster = totalLayersProcessed > 0 ? `${totalLayersProcessed} raster layers` : null;

    await updateJobState(jobId, {
      ...data,
      total_layers_processed: totalLayersProcessed,
      progress_percentage,
      progress_description: `Processed ${[progress_description_vector, progress_description_raster].filter(e => e !== null).join(' and ')}...`,
    });
  }

  return { total_layers_processed: totalLayersProcessed };
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

async function getJobData(jobId: string): Promise<ExportJob> {
  const boss = getPgBoss();
  const db = boss.getDb();
  const result = await db.executeSql(`SELECT data FROM ${PG_BOSS_SCHEMA}.job WHERE id = $1 AND state = 'active'`, [jobId]);
  return result.rows[0];
}
