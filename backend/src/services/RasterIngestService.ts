import path from 'path';
import { streamRasterFootprints } from '../scripts/computeRasterFootprints';
import { analyzeRasterMeta } from '../utils/raster';
import { getEntityManager } from '../utils/data-source';
import { log } from '../utils/logger';
import { MultiPolygon } from 'geojson';
import FileService from './FileService';
import { GdalCLI } from '../utils/GdalCLI';
import SoilPropertyEntity from '../entities/SoilProperty';

export interface IngestRasterOptions {
  input: string;
  nodata?: number;
  dataset: string;
  soilProperty: string;
  soilPropertyCategory: string;
  originaUnit?: string;
}

async function assertIsCog(filePath: string): Promise<void> {
  const { mainFilePath } = await FileService.getMainFilePath(filePath);
  const info = await GdalCLI.gdalinfo(mainFilePath);
  const band = info.bands?.[0];
  const isCog =
    info.metadata?.IMAGE_STRUCTURE?.LAYOUT === 'COG' ||
    ((band?.block?.[0] ?? 0) >= 256 && (band?.block?.[1] ?? 0) >= 256 && (band?.overviews?.length ?? 0) > 0);
  if (!isCog) {
    throw new Error(`Input is not a Cloud Optimized GeoTIFF: ${filePath}. Convert it first with convert_raster.sh.`);
  }
}

async function assertStandardUnit(
  em: Awaited<ReturnType<typeof import('../utils/data-source').getEntityManager>>,
  soilProperty: string,
  originalUnit: string,
): Promise<void> {
  const entity = await em.getRepository(SoilPropertyEntity).findOne({
    where: { property_name: soilProperty },
    relations: ['unit_conversions'],
  });
  if (!entity) {
    return;
  }
  const stdUnit = entity.standard_unit;
  if (!stdUnit || originalUnit === stdUnit) return;

  const conversion = entity.unit_conversions?.find(uc => uc.original_unit_of_measurement === originalUnit);
  if (conversion?.conversion_formula && conversion?.conversion_formula !== 'x') {
    throw new Error(
      `Input unit "${originalUnit}" does not match standard unit "${stdUnit}" for "${soilProperty}". Convert it first with convert_raster.sh. with conversion_factor ${conversion.conversion_formula.replace('x', '').replace('*', '')}`,
    );
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
     SELECT $2, id FROM fp_ins;`,
    [geomJsons, rasterLayerId],
  );
}

export async function ingestRaster(opts: IngestRasterOptions): Promise<string> {
  log.info('Starting raster ingest', { input: opts.input });
  const em = await getEntityManager();

  if (opts.originaUnit) {
    await assertStandardUnit(em, opts.soilProperty, opts.originaUnit);
  }

  await assertIsCog(opts.input);
  const cogPath = opts.input;
  log.info('COG ready', { cogPath });

  // Phase 1: read file header only — needed before inserting raster_layer to get resolution/bbox.
  const { nodata, resolution, bbox } = await analyzeRasterMeta(cogPath, opts.nodata);
  log.info('Raster metadata ready', { resolution });

  const outName = path.basename(cogPath);
  const bboxJson = JSON.stringify(bbox);

  await em.query("SET statement_timeout = '600s';");
  const result = await em.query(
    `WITH
     file_ins AS (
       INSERT INTO files ("name", file_path, created_by, status)
       VALUES ($1, $1, 'data-admin', 'LOADED')
       ON CONFLICT (file_path) DO UPDATE SET updated_at = now()
       RETURNING *
     ),
     ds_ins AS (
       INSERT INTO datasets ("name", created_by, spatial_extent, gis_datatype, n_raster_layers, status)
       VALUES ($2, 'data-admin', ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'raster', 1, 'LOADED')
       ON CONFLICT ("name") WHERE deleted_at IS NULL DO UPDATE SET
         updated_at = now(),
         spatial_extent = COALESCE(datasets.spatial_extent, EXCLUDED.spatial_extent),
         gis_datatype = COALESCE(datasets.gis_datatype, EXCLUDED.gis_datatype),
         n_raster_layers = datasets.n_raster_layers + 1
       RETURNING *
     ),
     spc_ins AS (
       INSERT INTO soil_property_categories (category_name, category_acronym)
       VALUES ($4, $4)
       ON CONFLICT (category_name) DO UPDATE SET updated_at = now()
       RETURNING *
     ),
     sp_ins AS (
       INSERT INTO soil_properties (property_name, property_acronym, category_id)
       SELECT $5, $5, spc_ins.id FROM spc_ins
       ON CONFLICT (property_name) DO UPDATE SET updated_at = now()
       RETURNING *
     )
     INSERT INTO raster_layers (
       file_id, dataset_id, soil_property_id, resolution_m,
       nodata_value, bbox
     )
     SELECT
       file_ins.id, ds_ins.id, sp_ins.id, $6,
       $7, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)
     FROM file_ins, ds_ins, sp_ins
     RETURNING id`,
    [outName, opts.dataset, bboxJson, opts.soilPropertyCategory, opts.soilProperty, resolution, nodata],
  );

  const rasterLayerId = (result as { id: string }[])[0]!.id;

  // Phase 2: stream footprint tiles in batches — each batch is inserted and released immediately.
  let totalFootprints = 0;
  await streamRasterFootprints(cogPath, opts.nodata, async batch => {
    await insertFootprintBatch(em, rasterLayerId, batch);
    totalFootprints += batch.length;
  });

  log.info('Raster ingest complete', { outName, footprintCount: totalFootprints });
  return outName;
}
