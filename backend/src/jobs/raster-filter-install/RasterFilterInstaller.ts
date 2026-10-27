import { Job } from 'pg-boss';
import { EntityManager } from 'typeorm';
import { promises as fs, createWriteStream } from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import RasterFilterEntity from '../../entities/RasterFilter';
import FileEntity from '../../entities/File';
import DatasetFileMappingEntity from '../../entities/DatasetFileMapping';
import RasterLayerAssetEntity from '../../entities/RasterLayerAsset';
import { RasterFilterInstallJob } from '../../interfaces/Job';
import { JobError } from '../../errors/JobError';
import { getEntityManager } from '../../utils/data-source';
import { getErrorMessage } from '../../utils/error';
import { log } from '../../utils/logger';
import { GdalCLI, GdalInfoOutput } from '../../utils/GdalCLI';
import { categoryLabels, geographicResolutionM, isGeographicCrs, RASTER_FILTER_OVERVIEW_FACTORS } from '../../utils/raster';
import { StorageModes } from '../../types/enums';
import FileService from '../../services/FileService';
import ConfigService from '../../services/ConfigService';
import { progressReporter } from '../../services/PgBoss';
import { takenRasterFilterNames } from '../../data-layer/RasterFilterInstalls';
import { loadRasterTable } from './loadRasterTable';

// Stage boundaries of the progress percentage
const EXTRACT_CEILING = 40;
const LOAD_CEILING = 80;
const CONSTRAINTS_CEILING = 88;
const VALUE_COUNT_CEILING = 96;

// The pixel types PostGIS rasters hold as whole numbers. Wider ones have no PostGIS pixel type.
const CATEGORICAL_PIXEL_TYPES = ['Byte', 'Int8', 'UInt16', 'Int16', 'UInt32', 'Int32'];
const FLOAT_PIXEL_TYPES = ['Float16', 'Float32', 'Float64', 'CFloat16', 'CFloat32', 'CFloat64'];

const GTIFF_CREATION_OPTIONS = ['-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', '-co', 'BIGTIFF=IF_SAFER'];

/**
 * The staging name an install loads into before renaming. Keyed on the job, so two attempts never share
 * tables, and led by an underscore, which no Raster Filter id can start with. Its longest overview,
 * o_32__rfi_<32 hex>, is 42 characters.
 */
export const stagingTableName = (jobId: string): string => `_rfi_${jobId.replace(/-/g, '')}`;

/**
 * Raster Filter Installation (docs/adr/0067): one band of the Raster Filter's File, in EPSG:4326 (docs/adr/0026's
 * scope note), becomes its base table and overview tables, and the File is deleted (docs/adr/0066).
 *
 * Everything is built under a staging name and renamed in one transaction at the end, so the
 * filter's base table, whose existence is what "installed" means, never exists half-built.
 * The filter stays inactive: an admin labels it and activates it.
 */
export async function processRasterFilterInstall(job: Job<RasterFilterInstallJob>): Promise<void> {
  const { id: jobId, data } = job;
  const { raster_filter_id: id, band } = data;
  const schema = process.env.POSTGRES_SCHEMA!;
  const entityManager = await getEntityManager();
  const reportProgress = progressReporter(jobId);
  const staging = stagingTableName(jobId);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'raster-filter-install-'));
  let tempZipExtractPath: string | null = null;

  try {
    await reportProgress(0, `Installing map-based filter '${id}'...`);
    const filter = await entityManager.getRepository(RasterFilterEntity).findOneBy({ id });
    if (!filter) {
      throw new JobError('RFI_FILTER_NOT_FOUND', { raster_filter_id: id });
    }
    const file = filter.file_id ? await entityManager.getRepository(FileEntity).findOneBy({ id: filter.file_id }) : null;
    if (!file) {
      throw new JobError('RFI_FILE_NOT_FOUND', { raster_filter_id: id });
    }

    let sourcePath: string;
    ({ sourcePath, tempZipExtractPath } = await localSource(file, workDir).catch(error => {
      throw new JobError('RFI_FILE_NOT_FOUND', { raster_filter_id: id }, getErrorMessage(error));
    }));
    const params = { raster_filter_id: id, file_name: file.name, band: String(band) };

    const info = await GdalCLI.gdalinfo(sourcePath).catch(error => {
      throw new JobError('RFI_WARP_FAILED', params, getErrorMessage(error));
    });
    const { reprojected, nodata } = checkSource(info, params, band);

    // One band, in EPSG:4326. A raster already there is copied, not resampled.
    const extracted = path.join(workDir, 'band.tif');
    const stage = reprojected
      ? `Reprojecting band ${band} of '${file.name}' to EPSG:4326...`
      : `Extracting band ${band} of '${file.name}'...`;
    await reportProgress(0, stage);
    let lastPercentage = 0;
    const onProgress = async (percent: number) => {
      const percentage = Math.floor((percent * EXTRACT_CEILING) / 100);
      if (percentage !== lastPercentage) {
        lastPercentage = percentage;
        await reportProgress(percentage, stage);
      }
    };
    try {
      if (reprojected) {
        const nodataArg = String(nodata);
        await GdalCLI.warp(
          sourcePath,
          extracted,
          [
            '-b',
            String(band),
            '-t_srs',
            'EPSG:4326',
            '-r',
            'near',
            '-srcnodata',
            nodataArg,
            '-dstnodata',
            nodataArg,
            ...GTIFF_CREATION_OPTIONS,
          ],
          onProgress,
        );
      } else {
        await GdalCLI.translate(sourcePath, extracted, ['-b', String(band), ...GTIFF_CREATION_OPTIONS], onProgress);
      }
    } catch (error) {
      throw new JobError('RFI_WARP_FAILED', params, getErrorMessage(error));
    }
    const extractedInfo = await GdalCLI.gdalinfo(extracted);
    const resolutionM = geographicResolutionM(extractedInfo.geoTransform![1]!);

    await reportProgress(EXTRACT_CEILING, `Writing map-based filter '${id}' to the database...`);
    await loadRasterTable(extracted, schema, staging).catch(error => {
      throw new JobError('RFI_DB_LOAD_FAILED', { raster_filter_id: id }, getErrorMessage(error));
    });

    // The overview constraints name their base table, which is about to be renamed. Nothing reads
    // raster_overviews: queries find overviews by their o_<factor>_ names.
    await reportProgress(LOAD_CEILING, `Preparing map-based filter '${id}'...`);
    for (const factor of RASTER_FILTER_OVERVIEW_FACTORS) {
      await entityManager.query(`SELECT DropOverviewConstraints($1, $2, 'rast')`, [schema, `o_${factor}_${staging}`]);
    }

    await reportProgress(CONSTRAINTS_CEILING, `Counting the values of map-based filter '${id}'...`);
    const pixelValues = await countPixelValues(entityManager, schema, staging);
    if (Object.keys(pixelValues).length === 0) {
      throw new JobError('RFI_NO_VALID_PIXELS', params);
    }
    // Read from the source, not the File's metadata, which predates them on older uploads
    const suggestedMappings = suggestedLabels(categoryLabels(info.bands?.[band - 1]), pixelValues);

    await reportProgress(VALUE_COUNT_CEILING, `Finishing map-based filter '${id}'...`);
    await entityManager.transaction(async em => {
      const taken = await takenRasterFilterNames(em, id);
      if (taken.length > 0) {
        throw new JobError('RFI_NAME_TAKEN', { raster_filter_id: id, table: taken[0] });
      }
      for (const factor of RASTER_FILTER_OVERVIEW_FACTORS) {
        await em.query(`ALTER TABLE "${schema}"."o_${factor}_${staging}" RENAME TO "o_${factor}_${id}"`);
      }
      // Index and sequence names keep the staging name: they are unique to this job, so never collide
      await em.query(`ALTER TABLE "${schema}"."${staging}" RENAME TO "${id}"`);
      const result = await em
        .getRepository(RasterFilterEntity)
        .update({ id }, { pixel_values: pixelValues, suggested_mappings: suggestedMappings, resolution_m: resolutionM, file_id: null });
      if (!result.affected) {
        throw new JobError('RFI_FILTER_NOT_FOUND', { raster_filter_id: id });
      }
    });

    // After the commit, as storage cannot take part in it
    await deleteSourceFile(entityManager, file, id);
    await reportProgress(100, `Map-based filter '${id}' installed`);
  } catch (error) {
    await dropStagingTables(entityManager, schema, staging);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
    if (tempZipExtractPath) {
      await fs.rm(tempZipExtractPath, { recursive: true, force: true });
    }
  }
}

/**
 * Validates the source band for installation. Returns whether it needs reprojecting to EPSG:4326, and
 * the nodata value the reprojection fills with.
 */
function checkSource(info: GdalInfoOutput, params: Record<string, string>, band: number): { reprojected: boolean; nodata?: number } {
  const wkt = info.coordinateSystem?.wkt;
  if (!info.geoTransform || !wkt) {
    throw new JobError('RFI_NOT_GEOREFERENCED', params);
  }
  const bands = info.bands ?? [];
  if (band < 1 || band > bands.length) {
    throw new JobError('RFI_INVALID_BAND', { ...params, band_count: String(bands.length) });
  }
  const pixelType = bands[band - 1]!.type ?? 'unknown';
  if (!CATEGORICAL_PIXEL_TYPES.includes(pixelType)) {
    const code = FLOAT_PIXEL_TYPES.includes(pixelType) ? 'RFI_CONTINUOUS_NOT_SUPPORTED' : 'RFI_UNSUPPORTED_PIXEL_TYPE';
    throw new JobError(code, { ...params, pixel_type: pixelType });
  }
  const reprojected = !(isGeographicCrs(wkt) && GdalCLI.extractEpsgFromWkt(wkt) === 4326);
  const nodata = bands[band - 1]!.noDataValue;
  // Reprojecting adds pixels outside the source's footprint, which would otherwise read as class 0
  if (reprojected && nodata === undefined) {
    throw new JobError('RFI_NODATA_REQUIRED', params);
  }
  return { reprojected, ...(nodata !== undefined && { nodata }) };
}

/**
 * A path GDAL reads the File from. Downloaded from S3 rather than read through /vsis3, as the raster
 * loader does: every pixel is read, and a download avoids GDAL's own S3 setup.
 */
async function localSource(file: FileEntity, workDir: string): Promise<{ sourcePath: string; tempZipExtractPath: string | null }> {
  if (ConfigService.getStorageConfig().storageMode === StorageModes.S3 && !file.file_path.toLowerCase().endsWith('.zip')) {
    const sourcePath = path.join(workDir, path.basename(file.file_path));
    // Piping to avoid OOM
    const stream = await FileService.getStorageEngine().read(file.file_path);
    await pipeline(stream as Readable, createWriteStream(sourcePath));
    return { sourcePath, tempZipExtractPath: null };
  }
  const { mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(file.file_path);
  return { sourcePath: mainFilePath, tempZipExtractPath };
}

/** The source's labels for the values the installed raster holds, or null when none of them is labelled. */
function suggestedLabels(labels: Record<string, number> | undefined, pixelValues: Record<string, number>): Record<string, number> | null {
  const present = Object.entries(labels ?? {}).filter(([, value]) => String(value) in pixelValues);
  return present.length > 0 ? Object.fromEntries(present) : null;
}

/** Pixel value → pixel count over the base table, nodata excluded. Exact, where an overview would miss rare classes. */
async function countPixelValues(entityManager: EntityManager, schema: string, table: string): Promise<Record<string, number>> {
  return entityManager.transaction(async em => {
    await em.query('SET LOCAL statement_timeout = 0');
    const rows: { value: string; count: string }[] = await em.query(
      `SELECT vc.value::bigint::text AS value, SUM(vc.cnt)::bigint AS count
       FROM "${schema}"."${table}" rr
       CROSS JOIN LATERAL ST_ValueCount(rr.rast, 1, true) AS vc(value, cnt)
       GROUP BY vc.value
       ORDER BY vc.value`,
    );
    return Object.fromEntries(rows.map(row => [row.value, Number(row.count)]));
  });
}

/**
 * Deletes an installed Raster Filter's source File (docs/adr/0066): its row, then its bytes, in one
 * transaction, so a failed storage delete rolls the row back and leaves the File PENDING and
 * unreferenced, for orphan cleanup. A File a Dataset took while the install was queued is kept, as
 * deleting it would break that Dataset.
 */
async function deleteSourceFile(entityManager: EntityManager, file: FileEntity, rasterFilterId: string): Promise<void> {
  const context = { raster_filter_id: rasterFilterId, file_id: file.id };
  try {
    await entityManager.transaction(async em => {
      const [mapping, asset] = await Promise.all([
        em.getRepository(DatasetFileMappingEntity).findOneBy({ file_id: file.id }),
        em.getRepository(RasterLayerAssetEntity).findOneBy({ file_id: file.id }),
      ]);
      if (mapping || asset) {
        log.warn('Kept an installed raster filter source file that a dataset uses', context);
        return;
      }
      await em.getRepository(FileEntity).delete({ id: file.id });
      await new FileService().deleteFileFromStorage(file.file_path);
    });
  } catch (error) {
    log.warn('Failed to delete an installed raster filter source file', { ...context, error: getErrorMessage(error) });
  }
}

/** Drops whatever this job's staging tables reached. A reaped job never gets here: orphan cleanup sweeps those. */
async function dropStagingTables(entityManager: EntityManager, schema: string, staging: string): Promise<void> {
  try {
    for (const table of [staging, ...RASTER_FILTER_OVERVIEW_FACTORS.map(f => `o_${f}_${staging}`)]) {
      await entityManager.query(`DROP TABLE IF EXISTS "${schema}"."${table}"`);
    }
  } catch (error) {
    log.warn('Failed to drop raster filter staging tables', { staging, error: getErrorMessage(error) });
  }
}
