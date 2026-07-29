import { streamRasterFootprints, type FootprintProgressCallback } from '../scripts/computeRasterFootprints';
import { analyzeRasterMeta } from '../utils/raster';
import { getEntityManager } from '../utils/data-source';
import { log, timed } from '../utils/logger';
import { MultiPolygon } from 'geojson';
import FileService from './FileService';
import { GdalCLI } from '../utils/GdalCLI';
import { JobError } from '../errors/JobError';

/**
 * Input for one Raster Ingest: one band of one already-uploaded COG.
 *
 * Reachable only through a Raster Load (docs/adr/0018), so the dataset and the file are
 * referenced by id — both provably exist, and an ingest never creates either. Entities are
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
  /** Resolved unit information, used to assert the pixels need no conversion. */
  standardUnit?: string | null;
  originalUnit?: string | null;
  conversionFormula?: string | null;
  onFootprintProgress?: FootprintProgressCallback;
}

async function assertIsCog(filePath: string, band: number): Promise<void> {
  const { mainFilePath } = await FileService.getMainFilePath(filePath);
  const info = await GdalCLI.gdalinfo(mainFilePath);
  // Check the band being ingested rather than band 1: a COG's bands share a layout, but
  // gdalinfo reports blocks and overviews per band, so this is both free and stricter.
  const bandInfo = info.bands?.[band - 1];
  const isCog =
    info.metadata?.IMAGE_STRUCTURE?.LAYOUT === 'COG' ||
    ((bandInfo?.block?.[0] ?? 0) >= 256 && (bandInfo?.block?.[1] ?? 0) >= 256 && (bandInfo?.overviews?.length ?? 0) > 0);
  if (!isCog) {
    throw new JobError('RL_NOT_COG', { file_name: filePath });
  }
}

/**
 * Raster values are used as-is — nothing converts pixels during a load — so a band whose values
 * are not already in the property's standard unit cannot be ingested. Kept here rather than in the
 * loader so a direct caller (including test fixtures) cannot bypass it.
 */
function assertStandardUnit(opts: IngestRasterOptions, filePath: string): void {
  const { standardUnit, originalUnit, conversionFormula } = opts;
  if (!standardUnit || !originalUnit || originalUnit === standardUnit) return;
  if (conversionFormula && conversionFormula !== 'x') {
    throw new JobError('RL_UNIT_NOT_STANDARD', {
      band: opts.band,
      file_name: filePath,
      original_unit: originalUnit,
      standard_unit: standardUnit,
      soil_property: opts.soilPropertySlug,
      conversion_factor: conversionFormula.replace('x', '').replace('*', ''),
    });
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
 * Idempotent per (file, band): re-ingesting a band updates its layer in place rather than adding a
 * sibling, so a Raster Load that failed part-way can simply be re-run. Writes nothing at dataset
 * level — updateRasterDatasetMetadata is the single writer of that (docs/adr/0018).
 */
export async function ingestRaster(opts: IngestRasterOptions): Promise<string> {
  const em = await getEntityManager();

  const file = await em.query(`SELECT file_path, "name" FROM files WHERE id = $1`, [opts.fileId]);
  const filePath: string | null = file[0]?.file_path ?? null;
  if (!filePath) {
    throw new Error(`File ${opts.fileId} has no file_path`);
  }
  log.info('Starting raster ingest', { input: filePath, band: opts.band });

  assertStandardUnit(opts, filePath);
  await assertIsCog(filePath, opts.band);
  log.info('COG ready', { filePath, band: opts.band });

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
