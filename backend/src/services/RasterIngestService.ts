import path from 'path';
import gdal from 'gdal-async';
import { analyzeRasterMeta, streamRasterFootprints } from '../scripts/computeRasterFootprints';
import { getEntityManager } from '../utils/data-source';
import { log } from '../utils/logger';
import { MultiPolygon } from 'geojson';
import FileService from './FileService';

export interface IngestRasterOptions {
  input: string;
  nodata?: number;
  dataset: string;
  soilProperty: string;
  soilPropertyCategory: string;
}

async function assertIsCog(filePath: string): Promise<void> {
  const { mainFilePath } = await FileService.getMainFilePath(filePath);
  const ds = await gdal.openAsync(mainFilePath);
  try {
    const meta = ds.getMetadata('') as Record<string, string>;
    const band = ds.bands.get(1);
    const isCog = meta['LAYOUT'] === 'COG' || (band.blockSize.x >= 256 && band.overviews.count() > 0);
    if (!isCog) {
      throw new Error(`Input is not a Cloud Optimized GeoTIFF: ${filePath}. Convert it first with convert_raster.sh.`);
    }
  } finally {
    ds.close();
  }
}

async function insertFootprintBatch(
  em: Awaited<ReturnType<typeof import('../utils/data-source').getEntityManager>>,
  rasterLayerId: string,
  batch: MultiPolygon[],
): Promise<void> {
  const geomJsons = batch.map(fp => JSON.stringify(fp));
  await em.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
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

  await assertIsCog(opts.input);
  const cogPath = opts.input;
  log.info('COG ready', { cogPath });

  // Phase 1: read file header only — needed before inserting raster_layer to get resolution/bbox.
  const { nodata, resolution, bbox } = await analyzeRasterMeta(cogPath, opts.nodata);
  log.info('Raster metadata ready', { resolution });

  const em = await getEntityManager();
  const outName = path.basename(cogPath);
  const bboxJson = JSON.stringify(bbox);

  await em.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
  await em.query("SET statement_timeout = '600s';");
  const result = await em.query(
    `WITH
     file_ins AS (
       INSERT INTO files ("name", file_path, created_by)
       VALUES ($1, $1, 'data-admin')
       ON CONFLICT (file_path) DO UPDATE SET updated_at = now()
       RETURNING *
     ),
     ds_ins AS (
       INSERT INTO datasets ("name", created_by, spatial_extent, gis_datatype, n_raster_layers)
       VALUES ($2, 'data-admin', ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'raster', 1)
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
