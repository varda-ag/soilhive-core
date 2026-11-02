import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { Job } from 'pg-boss';
import { ExportJob, ExportOutputs } from '../../interfaces/Job';
import { VectorFileFormat, RasterFileFormat } from './types';
import { getEntityManager } from '../../utils/data-source';
import {
  getTotalRecordsCount,
  createReadmeFile,
  fetchBatch,
  groupByProperty,
  getTotalLayersCount,
  fetchRasterLayers,
  fetchRasterLayerAssets,
  validateFileFormats,
  computeCombinedProgress,
} from './exportHelpers';
import { getPgBoss, PG_BOSS_SCHEMA, updateJobState } from '../../services/PgBoss';
import {
  assertWithinAreaLimit,
  assertWithinObservationLimit,
  assertWithinRasterLayerLimit,
  assertWithinXlsxRecordCap,
  getExportLimits,
} from './exportLimits';
import { GeoFileWriter } from './GeoFileWriter';
import { RasterFileWriter } from './RasterFileWriter';
import { RasterLayerPdfInfo } from './pdfGenerator';
import {
  cleanupTempFiles,
  cleanupTempZip,
  generateDownloadFilename,
  generateDownloadPath,
  mergeGPKG,
  moveToDownloadFolder,
  zipFiles,
  createTempDirectory,
} from './storageHelpers';
import { jobRequestData } from '../jobRequestData';
import { RequestData } from '../../interfaces/RequestData';
import { log } from '../../utils/logger';
import DatasetService from '../../services/DatasetService';
import FilterService from '../../services/FilterService';
import FileService from '../../services/FileService';
import { GISDataType } from '../../types/data';
import { getExportBatchSize } from '../../utils/utils';
import { JobError } from '../../errors/JobError';
import { FilteredRasterLayer } from '../../interfaces/DatasetFilter';
import { RasterLayerAssetFile } from '../../interfaces/RasterLayer';
import { getErrorMessage } from '../../utils/error';

/** What the vector or the raster half of an Export produced; raster_layers feeds the readme's layer table. */
type ExportPartResult = Partial<ExportOutputs> & { raster_layers?: RasterLayerPdfInfo[] };

export async function processExportJob(job: Job<ExportJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { filter_id, formats, dataset_ids, target_crs } = data;

  const entityManager = await getEntityManager();
  const requestData = await jobRequestData(entityManager, data);

  // Fresh working directory on every run, and therefore no partial output from any previous one.
  const tempDir = await createTempDirectory();
  let localZipPath: string | null = null;

  try {
    // Get total records and layers for progress tracking
    const datasetService = new DatasetService();
    const datasets = await Promise.all(dataset_ids.map(d => datasetService.getDataset(requestData, d)));
    const vectorDatasets = datasets.filter(d => d.gis_datatype && [GISDataType.POINT, GISDataType.POLYGONAL].includes(d.gis_datatype));
    const rasterDatasets = datasets.filter(d => d.gis_datatype === GISDataType.RASTER);
    const vectorRequested = vectorDatasets.length > 0;
    const rasterRequested = rasterDatasets.length > 0;

    const { vectorFormat, rasterFormat } = validateFileFormats(formats, vectorRequested, rasterRequested);

    const vectorData = { ...data, dataset_ids: vectorDatasets.map(d => d.slug) };
    const rasterData = { ...data, dataset_ids: rasterDatasets.map(d => d.slug) };

    // Export Limits are checked cheapest first, so an Export over the area limit never pays for the record count.
    const exportLimits = await getExportLimits(entityManager, data);
    const needsFilter = exportLimits.maxAreaM2 !== null || rasterRequested;
    const filter = needsFilter ? await new FilterService().getFilterById(requestData, filter_id) : null;
    if (filter) assertWithinAreaLimit(exportLimits, filter);

    const total_layers_estimate = rasterRequested ? await getTotalLayersCount(requestData, rasterData) : 0;
    assertWithinRasterLayerLimit(exportLimits, total_layers_estimate);

    const total_records_estimate = vectorRequested ? await getTotalRecordsCount(requestData, vectorData) : 0;
    assertWithinObservationLimit(exportLimits, total_records_estimate);

    // Checked before anything is written, so an over-sized request costs one count and no GDAL.
    // Submission checks the same limits only when it can count in time (docs/adr/0070), so this stays the authority.
    assertWithinXlsxRecordCap(vectorFormat, total_records_estimate);

    // Filter geometries' area for raster report tracking
    const aoi_area_km2 = rasterRequested && filter ? filter.area / 1e6 : null;

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

    if (total_records_estimate === 0 && total_layers_estimate === 0) {
      throwNoData(jobId, data, 'estimate', 0, 0);
    }

    const downloadPromises: Promise<ExportPartResult>[] = [];

    if (vectorRequested && vectorFormat) {
      downloadPromises.push(exportVectorData(jobId, requestData, vectorData, vectorFormat, tempDir, target_crs));
    }

    if (rasterRequested && rasterFormat) {
      downloadPromises.push(exportRasterData(jobId, requestData, rasterData, rasterFormat, tempDir, target_crs));
    }

    const results = await Promise.all(downloadPromises);
    const totalRecordsProcessed = results.reduce((sum, r) => sum + (r.total_records_processed ?? 0), 0);
    const totalLayersProcessed = results.reduce((sum, r) => sum + (r.total_layers_processed ?? 0), 0);

    if (await isJobCancelled(jobId)) {
      return;
    }

    // A non-zero estimate can still write nothing (e.g. a raster layer whose extent misses the aoi, or
    // an area of interest too small or thin to cover a pixel), which would otherwise ship a README-only ZIP.
    if (totalRecordsProcessed === 0 && totalLayersProcessed === 0) {
      throwNoData(jobId, data, 'processed', total_records_estimate, total_layers_estimate);
    }

    // Written once the data is, so that its layer table lists the Raster Layers actually exported
    await createReadmeFile(
      requestData,
      tempDir,
      data,
      results.flatMap(r => r.raster_layers ?? []),
    );

    const needsFileMerge =
      (vectorRequested && rasterRequested && vectorFormat === rasterFormat) ||
      (rasterRequested && totalLayersProcessed > 1 && rasterFormat === RasterFileFormat.GPKG);
    if (needsFileMerge) {
      await mergeGPKG(tempDir);
    }
    const downloadPath = generateDownloadPath(filter_id);
    localZipPath = path.join(os.tmpdir(), path.basename(downloadPath));
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
    if (localZipPath) {
      await cleanupTempZip(localZipPath);
    }
  }
}

async function exportVectorData(
  jobId: string,
  requestData: RequestData,
  data: any,
  fileFormat: VectorFileFormat,
  tempDir: string,
  targetCrs?: number,
): Promise<ExportPartResult> {
  if (!data.dataset_ids?.length) return { total_records_processed: 0 };

  const writer = new GeoFileWriter(fileFormat, targetCrs);

  // Always from the start. `data.current_cursor` is deliberately not read.
  // Resuming from it would produce a bundle with a hole in it.
  let cursor: string | undefined = undefined;
  let totalRecordsProcessed = 0;

  let cancelled = false;

  try {
    while (true) {
      if (await isJobCancelled(jobId)) {
        cancelled = true;
        break;
      }

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

    // Builds the real output file from staged batches, for the formats that stage.
    // Skipped on cancellation: processExportJob discards the whole temp directory in that case.
    if (!cancelled) await writer.finalize();
  } finally {
    await writer.dispose();
  }

  return { total_records_processed: totalRecordsProcessed };
}

async function exportRasterData(
  jobId: string,
  requestData: RequestData,
  data: any,
  fileFormat: RasterFileFormat,
  tempDir: string,
  targetCrs?: number,
): Promise<ExportPartResult> {
  if (!data.dataset_ids?.length) return { total_layers_processed: 0 };

  // aoi is the one GET /soil-data samples raster rows against (the Filter's geometries, intersected
  // with the selected raster filter classes when there are any), so both select the same pixels.
  const { layers, aoi } = await fetchRasterLayers(requestData, data);
  if (!layers.length || !aoi) return { total_layers_processed: 0 };

  // Batch-fetched once for every candidate layer, ahead of the write loop, rather than per
  // layer: one round-trip regardless of how many layers end up producing output.
  const assetsByLayerId = await fetchRasterLayerAssets(
    requestData,
    layers.map(layer => layer.id),
  );

  const writer = new RasterFileWriter(fileFormat, tempDir);
  // Named for every candidate up front, so that layers sharing a name are numbered the same way
  // whichever of them end up holding data
  const layerNames = writer.buildLayerNames(layers, targetCrs);
  // file_id → local path of the first written copy of a Raster Layer Asset. A File referenced by
  // several layers is read from storage once and copied locally into each layer's own subfolder.
  const assetPathCache = new Map<string, string>();
  const rasterLayers: RasterLayerPdfInfo[] = [];
  let totalLayersProcessed = 0;

  for (const layer of layers) {
    if (await isJobCancelled(jobId)) break;

    const layerName = layerNames.get(layer.id)!;
    const wrote = await writer.writeLayer(layer, aoi, targetCrs, layerName);
    if (!wrote) {
      log.warn('Raster layer produced no output: no valid pixel within the area of interest', {
        jobId,
        layerId: layer.id,
        crs: layer.wkt ?? layer.epsg ?? 4326,
      });
      continue;
    }

    totalLayersProcessed++;
    rasterLayers.push({
      layer_name: layerName,
      description: layer.description ?? null,
      dataset_name: layer.dataset_name,
      soil_property_name: layer.soil_property_name,
      min_depth: layer.min_depth,
      max_depth: layer.max_depth,
      reference_period_start: layer.reference_period_start,
      reference_period_stop: layer.reference_period_stop,
      laboratory_method: layer.laboratory_method,
      standard_unit: layer.standard_unit,
      crs: writer.crsLabel(layer, targetCrs),
    });

    await writeRasterLayerAssets(writer, layer, layerName, assetsByLayerId.get(layer.id) ?? [], assetPathCache, jobId);

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

  return { total_layers_processed: totalLayersProcessed, raster_layers: rasterLayers };
}

/**
 * Writes a layer's Raster Layer Assets into its assets subfolder, once its raster output has
 * already been written to the ZIP. Each unique File is streamed from storage once per job run;
 * later layers referencing it copy the first local copy (`assetPathCache`, by file_id). A storage
 * read failure is logged and only that asset is skipped — never fatal to the export job, and
 * never cached, so a later layer referencing the same File gets its own attempt (and its own
 * warning) rather than silently inheriting the first failure.
 */
async function writeRasterLayerAssets(
  writer: RasterFileWriter,
  layer: FilteredRasterLayer,
  layerName: string,
  assets: RasterLayerAssetFile[],
  assetPathCache: Map<string, string>,
  jobId: string,
): Promise<void> {
  if (assets.length === 0) return;

  for (const asset of assets) {
    const cachedPath = assetPathCache.get(asset.file_id);
    if (cachedPath) {
      await writer.writeAsset(layerName, asset.name, fs.createReadStream(cachedPath));
      continue;
    }
    try {
      const stream = await FileService.getStorageEngine().read(asset.file_path);
      const writtenPath = await writer.writeAsset(layerName, asset.name, stream as Readable);
      assetPathCache.set(asset.file_id, writtenPath);
    } catch (error) {
      log.warn('Could not read Raster Layer Asset from storage; skipping', {
        jobId,
        layerId: layer.id,
        fileId: asset.file_id,
        error: getErrorMessage(error),
      });
    }
  }
}

/**
 * An Export with nothing to write: the data changed after coverage was checked, the caller never
 * checked coverage, or a raster area of interest covers no pixel. Logged as a warning so each
 * occurrence is visible.
 */
function throwNoData(
  jobId: string,
  data: ExportJob,
  stage: 'estimate' | 'processed',
  recordsEstimate: number,
  layersEstimate: number,
): never {
  log.warn('Export has nothing to write', {
    jobId,
    stage,
    filterId: data.filter_id,
    datasetIds: data.dataset_ids,
    recordsEstimate,
    layersEstimate,
  });
  throw new JobError('EX_NO_DATA');
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
  return result.rows[0]?.data;
}
