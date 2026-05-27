import { spawn } from 'child_process';
import path from 'path';
import { analyzeRasterMeta, streamRasterFootprints } from '../scripts/computeRasterFootprints';
import type { FootprintTile } from '../scripts/computeRasterFootprints';
import { getEntityManager } from '../utils/data-source';
import { log } from '../utils/logger';

export interface IngestRasterOptions {
  input: string;
  out?: string;
  outDir?: string;
  nodata?: number;
  dataset: string;
  soilProperty: string;
  soilPropertyCategory: string;
  resampling?: string;
}

const SCRIPT = path.resolve(__dirname, '../../src/scripts/ingest_raster.sh');

function runCogConversion(opts: IngestRasterOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [opts.input];
    if (opts.out) args.push('--out', opts.out);
    if (opts.outDir) args.push('--out-dir', opts.outDir);
    if (opts.resampling) args.push('--resampling', opts.resampling);

    const proc = spawn('bash', [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ingest_raster.sh exited with code ${code}`));
      const cogPath = stdout.trim().split('\n').at(-1)?.trim() ?? '';
      if (!cogPath) return reject(new Error('ingest_raster.sh produced no output'));
      resolve(cogPath);
    });
  });
}

async function insertFootprintBatch(
  em: Awaited<ReturnType<typeof import('../utils/data-source').getEntityManager>>,
  rasterLayerId: string,
  batch: FootprintTile[],
): Promise<void> {
  const values = batch.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, ST_SetSRID(ST_GeomFromGeoJSON($${i * 3 + 4}), 4326))`).join(', ');
  await em.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
  await em.query(`INSERT INTO raster_footprints (raster_layer_id, tile_col, tile_row, geom) VALUES ${values}`, [
    rasterLayerId,
    ...batch.flatMap(fp => [fp.tileCol, fp.tileRow, JSON.stringify(fp.geom)]),
  ]);
}

export async function ingestRaster(opts: IngestRasterOptions): Promise<void> {
  log.info('Starting raster ingest', { input: opts.input });

  const cogPath = await runCogConversion(opts);
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
}
