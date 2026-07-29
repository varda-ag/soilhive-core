import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { streamRasterFootprints, type FootprintProgressCallback } from '../scripts/computeRasterFootprints';
import { analyzeRasterMeta } from '../utils/raster';
import { getEntityManager } from '../utils/data-source';
import { log, timed } from '../utils/logger';
import { MultiPolygon } from 'geojson';
import FileService from './FileService';
import ConfigService from './ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI } from '../utils/GdalCLI';
import { JobError } from '../errors/JobError';

/**
 * Input for one Raster Ingest: one band of one already-uploaded COG.
 *
 * Reachable only through a Raster Load (docs/adr/0018), so the dataset and the file are
 * referenced by id. An ingest never creates either. Entities are
 * referenced by slug and resolved in SQL: the raster_layers FK needs the id while
 * variables_measured stores the slug, and passing both forms from the caller would mean two
 * parameters that must describe the same row with nothing checking that they do.
 */
export interface IngestRasterOptions {
  fileId: string;
  /** 1-based, matching GDAL and the band_number in file metadata. */
  band: number;
  datasetId: string;
  soilPropertySlug: string;
  /** Required keys: a caller must state the depth, and null is a legitimate answer. */
  minDepth: number | null;
  maxDepth: number | null;
  referencePeriodStart?: string | null;
  referencePeriodStop?: string | null;
  procedureSlug?: string | null;
  onFootprintProgress?: FootprintProgressCallback;
}

/** What a file fails to satisfy, and therefore what the conversion has to fix. */
interface FormatDeviations {
  notCog: boolean;
  wrongCrs: number | undefined;
  /** One factor per band of the file, in band order; 1 leaves a band untouched. */
  unitFactors: number[] | null;
}

export type RasterConversionProgressCallback = (percentage: number, description: string) => Promise<void>;

/** The unit situation of one band the caller intends to ingest. */
export interface RasterBandUnit {
  band: number;
  soilPropertySlug: string;
  standardUnit?: string | null | undefined;
  originalUnit?: string | null | undefined;
  conversionFormula?: string | null | undefined;
}

export interface RasterFormatCheckOptions {
  fileId: string;
  /**
   * Every band the caller intends to ingest from this file. Scaling is applied to the file as a
   * whole, so all of them are needed at once to build a per-band factor list — bands absent here
   * are left at factor 1.
   */
  bands: RasterBandUnit[];
  /** Reports 0..100 across the conversion; not called when the file already conforms. */
  onProgress?: RasterConversionProgressCallback | undefined;
}

export interface RasterFormatCheckResult {
  /** The storage key to ingest from: the original when it conformed, else the converted file. */
  filePath: string;
  converted: boolean;
}

/**
 * A unit conversion is only expressible to convert_raster.sh as a single multiplier applied to
 * every pixel, so only identity and plain multiplications can be honoured. Returns null when no
 * scaling is needed, or a number to pass as --conversion_factor.
 */
function parseConversionFactor(formula: string): number | null {
  const normalized = formula.replace(/\s+/g, '');
  if (normalized === 'x') return null;
  const match = /^(?:x\*([0-9.eE+-]+)|([0-9.eE+-]+)\*x)$/.exec(normalized);
  const factor = Number(match?.[1] ?? match?.[2]);
  if (!match || !Number.isFinite(factor) || factor === 0) return NaN;
  return factor === 1 ? null : factor;
}

/**
 * Checks the file against the format a raster layer requires — Cloud Optimized GeoTIFF, EPSG:4326,
 * and pixels already in the soil property's standard unit — and normalizes it with
 * convert_raster.sh when it deviates, repointing the file record at the converted output.
 *
 * Replaces the previous pair of assertions: the same three conditions are still preconditions of
 * ingestion, but a deviation is now something the loader fixes rather than something it refuses.
 * A conforming file is left untouched, which also makes this a no-op for every band after the
 * first of a multiband file.
 */
export async function checkFileFormat(opts: RasterFormatCheckOptions): Promise<RasterFormatCheckResult> {
  const em = await getEntityManager();
  const [file] = await em.query(`SELECT file_path, "name" FROM files WHERE id = $1`, [opts.fileId]);
  const filePath: string | undefined = file?.file_path;
  if (!filePath) {
    throw new Error(`File ${opts.fileId} has no file_path`);
  }

  const { mainFilePath } = await FileService.getMainFilePath(filePath);
  const info = await GdalCLI.gdalinfo(mainFilePath);
  const bandCount = info.bands?.length ?? 1;

  // Checked per requested band rather than just band 1: a COG's bands share a layout, but
  // gdalinfo reports blocks and overviews per band, so this is both free and stricter.
  const isCog =
    info.metadata?.IMAGE_STRUCTURE?.LAYOUT === 'COG' ||
    opts.bands.every(({ band }) => {
      const bandInfo = info.bands?.[band - 1];
      return (bandInfo?.block?.[0] ?? 0) >= 256 && (bandInfo?.block?.[1] ?? 0) >= 256 && (bandInfo?.overviews?.length ?? 0) > 0;
    });

  const epsg = GdalCLI.extractEpsgFromWkt(info.coordinateSystem?.wkt);

  // One factor per band of the file, in band order. Bands the caller did not mention keep 1 and
  // pass through untouched — the factor list must be complete because a partial one would be
  // broadcast across every band.
  const unitFactors = new Array<number>(bandCount).fill(1);
  let anyScaling = false;
  for (const bandUnit of opts.bands) {
    const { standardUnit, originalUnit, conversionFormula, band } = bandUnit;
    if (!standardUnit || !originalUnit || originalUnit === standardUnit) continue;

    const factor = conversionFormula ? parseConversionFactor(conversionFormula) : NaN;
    if (Number.isNaN(factor)) {
      // Not expressible as a single multiplication; converting anyway would silently produce
      // wrong values, so this stays a hard failure.
      throw new JobError('RL_UNIT_NOT_CONVERTIBLE', {
        band,
        file_name: file.name,
        soil_property: bandUnit.soilPropertySlug,
        original_unit: originalUnit,
        standard_unit: standardUnit,
        formula: conversionFormula ?? 'none',
      });
    }
    if (factor !== null && band >= 1 && band <= bandCount) {
      unitFactors[band - 1] = factor;
      anyScaling = true;
    }
  }

  const deviations: FormatDeviations = {
    notCog: !isCog,
    wrongCrs: epsg !== 4326 ? epsg : undefined,
    unitFactors: anyScaling ? unitFactors : null,
  };
  if (!deviations.notCog && deviations.wrongCrs === undefined && deviations.unitFactors === null) {
    return { filePath, converted: false };
  }

  return {
    filePath: await convertRasterFile(em, opts, filePath, file.name, deviations),
    converted: true,
  };
}

/**
 * Normalizes a file with convert_raster.sh and repoints its record at the result.
 *
 * The script needs a real local file (it stats its input), so in S3 mode the object is pulled down
 * first and the output pushed back up. The converted key is derived deterministically from the
 * original, which keeps it beside its source and makes a repeated conversion overwrite rather than
 * accumulate. The source file is left in place: it is the only copy of the unnormalized data.
 */
async function convertRasterFile(
  em: Awaited<ReturnType<typeof import('../utils/data-source').getEntityManager>>,
  opts: RasterFormatCheckOptions,
  filePath: string,
  fileName: string,
  deviations: FormatDeviations,
): Promise<string> {
  const reasons = [
    deviations.notCog ? 'not a COG' : null,
    deviations.wrongCrs !== undefined ? `EPSG:${deviations.wrongCrs} rather than EPSG:4326` : null,
    deviations.unitFactors !== null ? `unit conversion x${deviations.unitFactors.join('/x')}` : null,
  ].filter(Boolean);
  log.info('Normalizing raster before ingest', { filePath, bands: opts.bands.map(b => b.band), reasons });

  const storage = FileService.getStorageEngine();
  const isS3 = ConfigService.getStorageConfig().storageMode === StorageModes.S3;
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'raster-convert-'));
  const outputPath = path.join(workDir, `${path.basename(filePath).replace(/\.tif$/i, '')}_cog.tif`);

  try {
    await opts.onProgress?.(0, `Normalizing '${fileName}' (${reasons.join(', ')})...`);

    let inputPath: string;
    if (isS3) {
      inputPath = path.join(workDir, path.basename(filePath));
      const stream = await storage.read(filePath);
      await fs.writeFile(inputPath, await FileService.streamToBuffer(stream as Readable));
    } else {
      ({ mainFilePath: inputPath } = await FileService.getMainFilePath(filePath));
    }

    await opts.onProgress?.(20, `Converting '${fileName}' (${reasons.join(', ')})...`);
    const args = [inputPath, '-o', outputPath];
    if (deviations.wrongCrs !== undefined) args.push('--target_srs', 'EPSG:4326');
    // One --conversion_factor per band, in band order: a shorter list would be broadcast over
    // every band, rescaling ones the caller never asked about.
    for (const factor of deviations.unitFactors ?? []) {
      args.push('--conversion_factor', String(factor));
    }
    const producedPath = await timed('convert_raster.sh', () => GdalCLI.convertRaster(args));

    // Deterministic so re-running a failed load overwrites its own output instead of piling up.
    let convertedKey = filePath.replace(/(\.tif)?$/i, '_cog.tif');
    if (convertedKey === filePath) convertedKey = filePath.replace(/(\.tif)?$/i, '_normalized.tif');

    await opts.onProgress?.(85, `Storing normalized '${fileName}'...`);
    if (await storage.fileExists(convertedKey)) {
      await storage.deleteFile(convertedKey);
    }
    await storage.write(convertedKey, createReadStream(producedPath));

    await em.query(`UPDATE files SET file_path = $1, updated_at = now() WHERE id = $2`, [convertedKey, opts.fileId]);
    log.info('Raster normalized', { from: filePath, to: convertedKey, bands: opts.bands.map(b => b.band), reasons });
    await opts.onProgress?.(100, `Normalized '${fileName}'`);

    return convertedKey;
  } catch (error: any) {
    throw new JobError('RL_CONVERSION_FAILED', { file_name: fileName, reasons: reasons.join(', ') }, error?.message);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function insertFootprintBatch(
  em: Awaited<ReturnType<typeof import('../utils/data-source').getEntityManager>>,
  rasterLayerId: string,
  batch: MultiPolygon[],
): Promise<void> {
  const geomJsons = batch.map(fp => JSON.stringify(fp));
  await em.query(
    `WITH fp_ins AS (INSERT INTO raster_footprints (geom)
     SELECT ST_SetSRID(ST_GeomFromGeoJSON(v), 4326)
     FROM unnest($1::text[]) AS v
     ON CONFLICT (geom_hash) DO UPDATE SET id = raster_footprints.id
     RETURNING id)
     INSERT INTO raster_layer_footprints (raster_layer_id, raster_footprint_id)
     SELECT $2, id FROM fp_ins
     ON CONFLICT (raster_layer_id, raster_footprint_id) DO NOTHING;`,
    [geomJsons, rasterLayerId],
  );
}

/**
 * Registers one band of a COG as a raster layer with its footprints, and returns the layer id.
 *
 * Reads the file exactly as it is on disk: normalizing it is the Raster Load's job, done once per
 * file for all of its mapped bands before any of them is ingested (checkFileFormat). An ingest must
 * not re-run that check itself — a unit conversion is derived from the mapping rather than from the
 * file, so it cannot tell scaled pixels from unscaled ones and would apply the factor a second time.
 *
 * Idempotent per (file, band): re-ingesting a band updates its layer in place rather than adding a
 * sibling, so a Raster Load that failed part-way can simply be re-run. Writes nothing at dataset
 * level — updateRasterDatasetMetadata is the single writer of that (docs/adr/0018).
 */
export async function ingestRaster(opts: IngestRasterOptions): Promise<string> {
  const em = await getEntityManager();

  // files.file_path is the single source of truth for where the data lives: normalization repoints
  // it at the converted output, so reading it here yields the normalized file when there was one.
  const [file] = await em.query(`SELECT file_path FROM files WHERE id = $1`, [opts.fileId]);
  const filePath: string | undefined = file?.file_path;
  if (!filePath) {
    throw new Error(`File ${opts.fileId} has no file_path`);
  }
  log.info('Starting raster ingest', { input: filePath, band: opts.band });

  // Phase 1: read the file header only — needed before inserting raster_layer to get
  // resolution/bbox. Resolution and bbox belong to the file; nodata is read per band.
  const { nodata, resolution, bbox } = await analyzeRasterMeta(filePath, opts.band);
  log.info('Raster metadata ready', { resolution, band: opts.band });
  // nodata_value is an int column, but Float32 rasters carry huge out-of-range sentinels (e.g. -3.4e+38)
  // that Postgres can't parse as an integer. Store those as null — it's just a marker, not real data.
  const INT4_MIN = -2147483648;
  const INT4_MAX = 2147483647;
  const roundedNodata = nodata == null ? null : Math.round(nodata);
  const dbNodataValue = roundedNodata != null && roundedNodata >= INT4_MIN && roundedNodata <= INT4_MAX ? roundedNodata : null;

  const bboxJson = JSON.stringify(bbox);

  const result = await timed('insert raster_layers', () =>
    em.query(
      `WITH
     sp AS (
       SELECT id, slug FROM soil_properties WHERE slug = $4 AND deleted_at IS NULL
     ),
     proc AS (
       SELECT id, slug FROM procedures WHERE slug = $5 AND deleted_at IS NULL
     )
     INSERT INTO raster_layers (
       file_id, dataset_id, band, soil_property_id, resolution_m,
       nodata_value, bbox, procedure_id, min_depth, max_depth,
       reference_period_start, reference_period_stop
     )
     SELECT
       $1::uuid, $2::uuid, $3::int, sp.id, $6::int,
       $7, ST_SetSRID(ST_GeomFromGeoJSON($8), 4326), proc.id, $9::int, $10::int,
       $11, $12
     FROM sp LEFT JOIN proc ON true
     ON CONFLICT (file_id, band) WHERE deleted_at IS NULL DO UPDATE SET
       updated_at = now(),
       dataset_id = EXCLUDED.dataset_id,
       soil_property_id = EXCLUDED.soil_property_id,
       resolution_m = EXCLUDED.resolution_m,
       nodata_value = EXCLUDED.nodata_value,
       bbox = EXCLUDED.bbox,
       procedure_id = EXCLUDED.procedure_id,
       min_depth = EXCLUDED.min_depth,
       max_depth = EXCLUDED.max_depth,
       reference_period_start = EXCLUDED.reference_period_start,
       reference_period_stop = EXCLUDED.reference_period_stop
     RETURNING id`,
      [
        opts.fileId,
        opts.datasetId,
        opts.band,
        opts.soilPropertySlug,
        opts.procedureSlug ?? null,
        resolution,
        dbNodataValue,
        bboxJson,
        opts.minDepth,
        opts.maxDepth,
        opts.referencePeriodStart ?? null,
        opts.referencePeriodStop ?? null,
      ],
    ),
  );

  const rasterLayerId = (result as { id: string }[])[0]?.id;
  if (!rasterLayerId) {
    throw new Error(`Soil property '${opts.soilPropertySlug}' not found — cannot create raster layer`);
  }

  // Phase 2: stream footprint tiles in batches — each batch is inserted and released immediately.
  // Footprints are per band: a sibling band's mask can cover different ground.
  //
  // Drop this layer's existing links first so a re-ingest cannot leave footprints from a previous
  // run behind. For unchanged pixels the links are simply rebuilt identically; the reset only
  // matters when the file's contents changed under the same path. raster_footprints rows are
  // shared between layers by geom_hash, so only the links are removed here, never the geometry.
  await em.query(`DELETE FROM raster_layer_footprints WHERE raster_layer_id = $1`, [rasterLayerId]);

  await em.query("SET statement_timeout = '600s';");
  let totalFootprints = 0;
  await streamRasterFootprints(
    filePath,
    opts.band,
    async batch => {
      await insertFootprintBatch(em, rasterLayerId, batch);
      totalFootprints += batch.length;
    },
    opts.onFootprintProgress,
  );

  log.info('Raster ingest complete', { filePath, band: opts.band, rasterLayerId, footprintCount: totalFootprints });
  return rasterLayerId;
}
