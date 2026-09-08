import type { MultiPolygon } from 'geojson';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import FileService from '../services/FileService';
import { GdalCLI } from '../utils/GdalCLI';
import { log, timed } from '../utils/logger';
import { isGeographicCrs } from '../utils/raster';

const MAX_TILES = 256 * 256;
const MIN_TILES = 256;
const PIXELS_PER_TILE_MIN_DIM = 512;
// A footprint's vertex count depends on how fragmented the valid-data mask is within its tile —
// not on raster shape — so batches are sized by accumulated vertex count rather than by footprint
// count. Each vertex costs 16 bytes as WKB (two float64s); 200_000 keeps one batch's payload in the
// low tens of MB, comfortable even under a constrained heap.
const MAX_BATCH_VERTICES = 200_000;
// Backstop against many degenerate, near-empty footprints trickling through the vertex budget
// almost one at a time.
const MAX_BATCH_FOOTPRINTS = 500;

export type FootprintBatchCallback = (tiles: MultiPolygon[]) => Promise<void>;

/** Reports tile progress within a single band's footprint pass. */
export type FootprintProgressCallback = (tilesProcessed: number, totalTiles: number) => Promise<void>;

function computeGrid(rasterWidth: number, rasterHeight: number): { nCols: number; nRows: number } {
  const rasterArea = rasterWidth * rasterHeight;
  const earthArea = 360 * 180;
  const targetTiles = Math.max(MIN_TILES, Math.min(MAX_TILES, Math.round((rasterArea / earthArea) * MAX_TILES)));
  const nCols = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterWidth / rasterHeight))));
  const nRows = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterHeight / rasterWidth))));
  return { nCols, nRows };
}

/**
 * Streams the footprints of one band. Footprints are per-band: each band carries its own
 * valid-data mask, so two bands of one file can cover different ground. `band` is 1-based.
 *
 * Each tile's footprint is computed by `gdal_footprint` against a tiny VRT window into a
 * once-per-band local extract of the selected overview.
 */
export async function streamRasterFootprints(
  cogPath: string,
  band: number,
  onBatch: FootprintBatchCallback,
  onProgress?: FootprintProgressCallback,
): Promise<void> {
  const { colBounds, rowBounds, nCols, nRows, overviewPath } = await timed('footprint extraction setup', async () => {
    const { mainFilePath } = await FileService.getMainFilePath(cogPath);

    const info = await GdalCLI.gdalinfo(mainFilePath);
    const gt = info.geoTransform;
    if (!gt) throw new Error('Raster has no geoTransform');

    const epsg = GdalCLI.extractEpsgFromWkt(info.coordinateSystem?.wkt);
    const isGeo = isGeographicCrs(info.coordinateSystem?.wkt);
    const srcSrs = !isGeo || (epsg !== undefined && epsg !== 4326) ? info.coordinateSystem!.wkt! : null;

    const [rasterNativeWidth, rasterNativeHeight] = info.size ?? [0, 0];
    const xMin = gt[0]!;
    const yMax = gt[3]!;
    const pixWFull = gt[1]!;
    const pixHFull = gt[5]!;
    const xMax = xMin + rasterNativeWidth * pixWFull;
    const yMin = yMax + rasterNativeHeight * pixHFull;
    // Tile bounds below are computed in the raster's native units throughout — only the grid's
    // own sizing needs a real degree extent, since a Web Mercator raster's native width is in
    // metres and would otherwise be compared against computeGrid's degree-based earthArea
    // constant as if it were one.
    const rasterWidthNative = xMax - xMin;
    const rasterHeightNative = yMax - yMin;
    let gridWidthDeg = rasterWidthNative;
    let gridHeightDeg = rasterHeightNative;
    if (srcSrs) {
      const corners = await GdalCLI.transformPoints(srcSrs, [
        [xMin, yMin],
        [xMax, yMax],
      ]);
      const [lonMin, latMin] = corners[0]!;
      const [lonMax, latMax] = corners[1]!;
      gridWidthDeg = Math.abs(lonMax - lonMin);
      gridHeightDeg = Math.abs(latMax - latMin);
    }

    const nativePixelSize = Math.abs(pixWFull);
    const { nCols, nRows } = computeGrid(gridWidthDeg, gridHeightDeg);
    const tileW = rasterWidthNative / nCols;
    const tileH = rasterHeightNative / nRows;
    const tileMinDim = Math.min(tileW, tileH);

    // Select overview: mirrors original GDAL logic — coarsest overview satisfying the resolution
    // criterion, falling back to the finest overview, or to full resolution if none exist at all.
    const overviews = info.bands?.[band - 1]?.overviews ?? [];
    let selectedSize: [number, number] | undefined;
    for (let i = overviews.length - 1; i >= 0; i--) {
      const [w] = overviews[i]!.size;
      const ovPixelSize = nativePixelSize * (rasterNativeWidth / w);
      if (ovPixelSize < tileMinDim / PIXELS_PER_TILE_MIN_DIM) {
        selectedSize = overviews[i]!.size;
        break;
      }
    }
    if (!selectedSize) selectedSize = overviews[0]?.size ?? [rasterNativeWidth, rasterNativeHeight];
    const [ovWidth, ovHeight] = selectedSize;

    // Every tile's footprint is computed from a VRT window into this file, so it always needs to
    // exist as its own flat, single-resolution, single-band file regardless of storage mode — a
    // VRT SrcRect window addresses pixels of the file it points to directly, with no way to select
    // "overview level N" of a multi-resolution source. -outsize matches the overview's own
    // dimensions exactly, so GDAL reads the COG's embedded overview data as-is rather than
    // resampling from full resolution.
    const overviewPath = path.join(os.tmpdir(), `footprint-overview-${Date.now()}-${Math.random().toString(36).slice(2)}.tif`);
    await timed('extract overview locally', () =>
      GdalCLI.translate(mainFilePath, overviewPath, [
        '-b',
        String(band),
        '-outsize',
        String(ovWidth),
        String(ovHeight),
        '-co',
        'TILED=YES',
        '-co',
        'BLOCKXSIZE=256',
        '-co',
        'BLOCKYSIZE=256',
        '-co',
        'COMPRESS=DEFLATE',
      ]),
    );

    const ovPixelW = rasterWidthNative / ovWidth;
    const ovPixelH = rasterHeightNative / ovHeight;

    // Shared boundaries, not independent per-tile floor/ceil: avoids duplicate footprints
    // in reprojected tiles that become overlapping and share a pixel row in WGS84.
    const colBounds = Array.from({ length: nCols + 1 }, (_, c) => Math.min(ovWidth, Math.round((c * tileW) / ovPixelW)));
    const rowBounds = Array.from({ length: nRows + 1 }, (_, r) => Math.min(ovHeight, Math.round((r * tileH) / ovPixelH)));

    return { colBounds, rowBounds, nCols, nRows, overviewPath };
  });

  try {
    let batch: MultiPolygon[] = [];
    let batchVertexCount = 0;

    const totalTiles = nRows * nCols;
    const progressLogInterval = Math.max(1, Math.floor(totalTiles / 20));
    let tilesProcessed = 0;
    let footprintsFound = 0;
    let vrtMs = 0;
    let footprintMs = 0;
    let dbMs = 0;
    const startedAt = Date.now();
    // Avoids two runs silently colliding on the same tile VRT filenames in os.tmpdir() 
    // in a potential future implementation of parallel per-band ingestion or localConcurrency bump.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    for (let iRow = 0; iRow < nRows; iRow++) {
      for (let iCol = 0; iCol < nCols; iCol++) {
        tilesProcessed++;
        if (tilesProcessed % progressLogInterval === 0) {
          log.info('Footprint extraction progress', {
            band,
            tilesProcessed,
            totalTiles,
            footprintsFound,
            elapsedMs: Date.now() - startedAt,
            vrtMs,
            footprintMs,
            dbMs,
          });
          await onProgress?.(tilesProcessed, totalTiles);
        }

        const pxStart = colBounds[iCol]!;
        const pxEnd = colBounds[iCol + 1]!;
        const pyStart = rowBounds[iRow]!;
        const pyEnd = rowBounds[iRow + 1]!;

        const tilePixW = pxEnd - pxStart;
        const tilePixH = pyEnd - pyStart;
        if (tilePixW <= 0 || tilePixH <= 0) continue;

        const vrtPath = path.join(os.tmpdir(), `footprint-tile-${runId}-${iRow}-${iCol}.vrt`);
        let t = Date.now();
        await GdalCLI.translate(overviewPath, vrtPath, [
          '-of',
          'VRT',
          '-srcwin',
          String(pxStart),
          String(pyStart),
          String(tilePixW),
          String(tilePixH),
        ]);
        vrtMs += Date.now() - t;

        let geojson: { features: Array<{ geometry: MultiPolygon }> };
        try {
          t = Date.now();
          const stdout = await GdalCLI.footprint(vrtPath, '/vsistdout/', [
            '-b',
            '1',
            '-max_points',
            'unlimited',
            '-t_srs',
            'EPSG:4326',
            '-of',
            'GeoJSON',
            '-q',
          ]);
          footprintMs += Date.now() - t;
          geojson = JSON.parse(stdout);
        } finally {
          await fs.unlink(vrtPath).catch(() => {});
        }

        const multiPolygon = geojson.features[0]?.geometry;
        if (!multiPolygon) continue;

        batch.push(multiPolygon);
        footprintsFound++;
        for (const polygon of multiPolygon.coordinates) {
          for (const ring of polygon) batchVertexCount += ring.length;
        }

        if (batchVertexCount >= MAX_BATCH_VERTICES || batch.length >= MAX_BATCH_FOOTPRINTS) {
          t = Date.now();
          await onBatch(batch);
          dbMs += Date.now() - t;
          batch = [];
          batchVertexCount = 0;
        }
      }
    }

    if (batch.length > 0) {
      const t = Date.now();
      await onBatch(batch);
      dbMs += Date.now() - t;
    }

    log.info('Footprint extraction complete', {
      band,
      tilesProcessed,
      totalTiles,
      footprintsFound,
      elapsedMs: Date.now() - startedAt,
      vrtMs,
      footprintMs,
      dbMs,
    });
  } finally {
    await fs.unlink(overviewPath).catch(() => {});
  }
}
