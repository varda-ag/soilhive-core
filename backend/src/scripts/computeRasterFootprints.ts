import type { MultiPolygon } from 'geojson';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fromFile, type GeoTIFF } from 'geotiff';
import FileService from '../services/FileService';
import ConfigService from '../services/ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI } from '../utils/GdalCLI';
import { log, timed } from '../utils/logger';
import { openTiff, isGeographicCrs } from '../utils/raster';

const MAX_TILES = 256 * 256;
const MIN_TILES = 256;
const PIXELS_PER_TILE_MIN_DIM = 512;
const INSERT_BATCH_SIZE = 100;

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
 */
export async function streamRasterFootprints(
  cogPath: string,
  band: number,
  onBatch: FootprintBatchCallback,
  onProgress?: FootprintProgressCallback,
): Promise<void> {
  const {
    selectedImage,
    sampleIndex,
    ovPixelW,
    ovPixelH,
    xMin,
    yMax,
    colBounds,
    rowBounds,
    nCols,
    nRows,
    nodataF32,
    overviewTempPath,
    srcSrs,
    tiff,
    localTiff,
  } = await timed('footprint extraction setup', async () => {
    const { mainFilePath } = await FileService.getMainFilePath(cogPath);

    const info = await GdalCLI.gdalinfo(mainFilePath);
    const gt = info.geoTransform;
    if (!gt) throw new Error('Raster has no geoTransform');

    // Footprints are always stored in EPSG:4326 (see insertFootprintBatch); a raster in any other
    // CRS has its batches reprojected below. Missing CRS metadata is treated as already-4326,
    // matching how vector files with no declared CRS are handled (FileService.fileToDB).
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
    // Tile bounds and pixel windows below are computed in the raster's native units throughout —
    // only the grid's own sizing needs a real degree extent, since a Web Mercator raster's native
    // width is in metres and would otherwise be compared against computeGrid's degree-based
    // earthArea constant as if it were one.
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

    // gdalinfo reports noDataValue as a plain double parsed from the TIFF's text tag, but pixel
    // data here is read as Float32 — the same decimal sentinel rounds to a different nearest value
    // in each precision, so an exact double comparison against it never matches. Round through
    // float32 first so the threshold lands on the same value the pixel data was already quantized to.
    const nodata: number | null = info.bands?.[band - 1]?.noDataValue ?? null;
    const nodataF32 = nodata === null ? null : Math.fround(nodata);
    const nativePixelSize = Math.abs(pixWFull);

    const { nCols, nRows } = computeGrid(gridWidthDeg, gridHeightDeg);
    const tileW = rasterWidthNative / nCols;
    const tileH = rasterHeightNative / nRows;
    const tileMinDim = Math.min(tileW, tileH);

    const tiff = await openTiff(cogPath);
    const imageCount = await tiff.getImageCount();

    // Select overview: mirrors original GDAL logic — coarsest overview satisfying
    // the resolution criterion, falling back to finest overview.
    let selectedIndex = 0;
    for (let i = imageCount - 1; i >= 1; i--) {
      const ovImage = await tiff.getImage(i);
      const ovPixelSize = nativePixelSize * (rasterNativeWidth / ovImage.getWidth());
      if (ovPixelSize < tileMinDim / PIXELS_PER_TILE_MIN_DIM) {
        selectedIndex = i;
        break;
      }
    }
    if (selectedIndex === 0 && imageCount > 1) selectedIndex = 1;

    let selectedImage = await tiff.getImage(selectedIndex);
    const ovWidth = selectedImage.getWidth();
    const ovHeight = selectedImage.getHeight();
    const ovPixelW = rasterWidthNative / ovWidth;
    const ovPixelH = rasterHeightNative / ovHeight;

    // The index to read from `selectedImage` differs between the two paths below, so it is
    // decided here alongside the image itself rather than at the read site: the S3 path
    // extracts the band into a single-band local file (index 0 forever), while the local
    // path reads the original multiband overview (index band - 1).
    let sampleIndex = band - 1;

    // Over the network (S3), reading each tile window directly against a presigned URL costs one
    // HTTP round-trip per tile — thousands of them. Pull the selected overview once via GDAL's
    // pooled /vsis3/ VSI (same path gdalinfo already uses above) and read tiles from that local
    // copy instead. -outsize matches the overview's own dimensions exactly, so GDAL reads the
    // COG's embedded overview data as-is rather than resampling from full resolution.
    let overviewTempPath: string | null = null;
    let localTiff: GeoTIFF | null = null;
    if (ConfigService.getStorageConfig().storageMode === StorageModes.S3) {
      overviewTempPath = path.join(os.tmpdir(), `footprint-overview-${Date.now()}-${Math.random().toString(36).slice(2)}.tif`);
      await timed('download overview locally', () =>
        GdalCLI.translate(mainFilePath, overviewTempPath!, [
          '-b',
          String(band),
          '-outsize',
          String(ovWidth),
          String(ovHeight),
          // TODO: review if needed
          // '-r',
          // 'nearest',
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
      localTiff = await fromFile(overviewTempPath);
      selectedImage = await localTiff.getImage(0);
      // -b above already collapsed the file to the single requested band.
      sampleIndex = 0;
    }

    // Shared boundaries, not independent per-tile floor/ceil: avoids duplicate footprints
    // in reprojected tiles that become overlapping and share a pixel row in WGS84.
    const colBounds = Array.from({ length: nCols + 1 }, (_, c) => Math.min(ovWidth, Math.round((c * tileW) / ovPixelW)));
    const rowBounds = Array.from({ length: nRows + 1 }, (_, r) => Math.min(ovHeight, Math.round((r * tileH) / ovPixelH)));

    return {
      selectedImage,
      sampleIndex,
      ovWidth,
      ovHeight,
      ovPixelW,
      ovPixelH,
      xMin,
      yMax,
      colBounds,
      rowBounds,
      nCols,
      nRows,
      nodataF32,
      overviewTempPath,
      srcSrs,
      tiff,
      localTiff,
    };
  });

  try {
    let batch: MultiPolygon[] = [];

    const totalTiles = nRows * nCols;
    const progressLogInterval = Math.max(1, Math.floor(totalTiles / 20));
    let tilesProcessed = 0;
    let footprintsFound = 0;
    let readMs = 0;
    let traceMs = 0;
    let dbMs = 0;
    const startedAt = Date.now();

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
            readMs,
            traceMs,
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

        let t = Date.now();
        const rasters = await selectedImage.readRasters({
          window: [pxStart, pyStart, pxEnd, pyEnd],
          samples: [sampleIndex],
        });
        readMs += Date.now() - t;
        const rawData = rasters[0] as ArrayLike<number>;

        const mask = new Uint8Array(tilePixW * tilePixH);
        let hasValid = false;
        for (let i = 0; i < rawData.length; i++) {
          const v = rawData[i] as number;
          const valid = !Number.isNaN(v) && (nodataF32 === null || v !== nodataF32);
          if (valid) {
            mask[i] = 1;
            hasValid = true;
          }
        }
        if (!hasValid) continue;

        const tileGeoXMin = xMin + pxStart * ovPixelW;
        const tileGeoYMax = yMax - pyStart * ovPixelH;

        t = Date.now();
        const polygonCoords = traceMaskToPolygons(mask, tilePixW, tilePixH, tileGeoXMin, tileGeoYMax, ovPixelW, ovPixelH);
        traceMs += Date.now() - t;
        if (polygonCoords.length === 0) continue;

        batch.push({ type: 'MultiPolygon', coordinates: polygonCoords });
        footprintsFound++;

        if (batch.length >= INSERT_BATCH_SIZE) {
          t = Date.now();
          const projected = srcSrs ? await reprojectToWgs84(batch, srcSrs) : batch;
          await onBatch(collapseCollinearBatch(projected));
          dbMs += Date.now() - t;
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      const t = Date.now();
      const projected = srcSrs ? await reprojectToWgs84(batch, srcSrs) : batch;
      await onBatch(collapseCollinearBatch(projected));
      dbMs += Date.now() - t;
    }

    log.info('Footprint extraction complete', {
      band,
      tilesProcessed,
      totalTiles,
      footprintsFound,
      elapsedMs: Date.now() - startedAt,
      readMs,
      traceMs,
      dbMs,
    });
  } finally {
    await Promise.resolve(tiff.close()).catch(() => {});
    await Promise.resolve(localTiff?.close()).catch(() => {});
    if (overviewTempPath) {
      await fs.unlink(overviewTempPath).catch(() => {});
    }
  }
}

/**
 * Reprojects every vertex of a batch of footprints from `srcSrs` to EPSG:4326 in one
 * `gdaltransform` call, rather than one per tile — batches land here only once every
 * INSERT_BATCH_SIZE footprints, keeping the number of GDAL processes proportional to that instead
 * of to the (much larger) number of tiles visited.
 */
async function reprojectToWgs84(batch: MultiPolygon[], srcSrs: string): Promise<MultiPolygon[]> {
  const points: [number, number][] = [];
  for (const { coordinates } of batch) {
    for (const polygon of coordinates) {
      for (const ring of polygon) {
        for (const [x, y] of ring) points.push([x!, y!]);
      }
    }
  }

  const transformed = await GdalCLI.transformPoints(srcSrs, points);

  let i = 0;
  return batch.map(({ coordinates }) => ({
    type: 'MultiPolygon',
    coordinates: coordinates.map(polygon => polygon.map(ring => ring.map(() => transformed[i++]!))),
  }));
}

function traceMaskToPolygons(
  mask: Uint8Array,
  w: number,
  h: number,
  xMin: number,
  yMax: number,
  pixW: number,
  pixH: number,
): MultiPolygon['coordinates'] {
  const W1 = w + 1;
  const adj = new Map<number, number[]>();

  const addEdge = (fc: number, fr: number, tc: number, tr: number) => {
    const k = fr * W1 + fc;
    const v = tr * W1 + tc;
    const list = adj.get(k);
    if (list) list.push(v);
    else adj.set(k, [v]);
  };

  const at = (r: number, c: number): number => (r >= 0 && r < h && c >= 0 && c < w ? (mask[r * w + c] as number) : 0);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!at(r, c)) continue;
      if (!at(r - 1, c)) addEdge(c, r, c + 1, r);
      if (!at(r + 1, c)) addEdge(c + 1, r + 1, c, r + 1);
      if (!at(r, c - 1)) addEdge(c, r + 1, c, r);
      if (!at(r, c + 1)) addEdge(c + 1, r, c + 1, r + 1);
    }
  }

  const maxNode = W1 * (h + 1);
  const used = new Set<number>();
  const encode = (f: number, t: number) => f * maxNode + t;

  const exterior: number[][][] = [];
  const holes: number[][][] = [];

  for (const [startK, startOuts] of adj) {
    for (const firstTo of startOuts) {
      if (used.has(encode(startK, firstTo))) continue;

      const ring: number[][] = [];
      let cur = startK;
      let nxt = firstTo;

      for (;;) {
        used.add(encode(cur, nxt));
        ring.push([xMin + (cur % W1) * pixW, yMax - Math.floor(cur / W1) * pixH]);
        cur = nxt;
        if (cur === startK) break;
        const nexts = adj.get(cur);
        if (!nexts) break;
        nxt = nexts.find(t => !used.has(encode(cur, t))) ?? -1;
        if (nxt === -1) break;
      }

      if (ring.length < 3) continue;

      // Shoelace signed area (unclosed ring, wrap-around index)
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        area += ring[i]![0]! * ring[j]![1]! - ring[j]![0]! * ring[i]![1]!;
      }

      // Tracer produces CW exterior (area < 0) and CCW holes (area > 0).
      // GeoJSON requires CCW exterior and CW holes — reverse both.
      // Left dense here (one vertex per pixel-edge step) rather than collapsed: a straight run in
      // this native/projected space can reproject into a true curve in EPSG:4326, and that density
      // is what lets reprojectToWgs84 trace the curve instead of chording between sparse corners.
      // Collinear points are collapsed after reprojection instead — see streamRasterFootprints.
      const closed = [...ring, ring[0]!];
      if (area < 0) exterior.push(closed.reverse());
      else holes.push(closed.slice().reverse());
    }
  }

  const result: MultiPolygon['coordinates'] = exterior.map(e => [e]);

  for (const hole of holes) {
    const [hx, hy] = hole[0]!;
    const container = result.find(poly => pointInRing(hx!, hy!, poly[0]!));
    if (container) container.push(hole);
  }

  return result;
}

/**
 * Drops ring points that sit exactly on the line between their neighbors. Boundary tracing walks
 * one pixel-edge at a time, so a straight run of collinear steps is represented by a matching run of
 * strictly collinear vertices — removing them is lossless (same polygon, fewer points).
 */
function collapseCollinear(ring: number[][]): number[][] {
  const n = ring.length - 1; // last point duplicates the first (closed ring)
  if (n <= 3) return ring;

  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const cur = ring[i]!;
    const next = ring[i + 1]!;
    const dx1 = cur[0]! - prev[0]!;
    const dy1 = cur[1]! - prev[1]!;
    const dx2 = next[0]! - cur[0]!;
    const dy2 = next[1]! - cur[1]!;
    if (dx1 * dy2 - dy1 * dx2 !== 0) out.push(cur);
  }
  out.push(out[0]!);
  return out;
}

/** Applies collapseCollinear to every ring of every footprint, once they're in their final CRS. */
function collapseCollinearBatch(batch: MultiPolygon[]): MultiPolygon[] {
  return batch.map(({ coordinates }) => ({
    type: 'MultiPolygon',
    coordinates: coordinates.map(polygon => polygon.map(ring => collapseCollinear(ring))),
  }));
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) {
      inside = !inside;
    }
  }
  return inside;
}
