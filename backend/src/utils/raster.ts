import { xyz } from 'gdal-async';
import { Envelope, PixelWindow } from '../interfaces/RasterLayer';

/**
 * Returns the PostGIS table name to query given an AOI area in m².
 *
 * Strategy: pick the coarsest overview whose effective pixel size
 * still keeps the AOI represented by at least ~TARGET_PIXELS pixels.
 * If the AOI is small (high detail needed), use the base table.
 *
 * @param table     - e.g. "land_cover"
 * @param aoiAreaM2 - total input AOI size in square meters
 */
export const selectOverviewTable = (table: string, aoiAreaM2: number): string => {
  const BASE_PIXEL_SIZE_M = 100; // meters per pixel at overview factor 1
  const TARGET_PIXELS = 512; // minimum pixels to represent the AOI (one full tile worth)
  const OVERVIEWS = [32, 16, 8, 4, 2] as const;

  // For each candidate (from coarsest to finest), check if the AOI
  // covers at least TARGET_PIXELS pixels at that overview resolution.
  // pixelSizeM = BASE_PIXEL_SIZE_M * factor
  // pixelAreaM2 = pixelSizeM * pixelSizeM
  // pixelCount = aoiAreaM2 / pixelAreaM2
  //
  // We want pixelCount >= TARGET_PIXELS (enough detail for the AOI).
  // Pick the coarsest overview that still satisfies this.

  for (const factor of OVERVIEWS) {
    const pixelSizeM = BASE_PIXEL_SIZE_M * factor;
    const pixelAreaM2 = pixelSizeM ** 2;
    const pixelCount = aoiAreaM2 / pixelAreaM2;
    if (pixelCount >= TARGET_PIXELS) {
      return `o_${factor}_${table}`;
    }
  }

  // AOI is small — use the base full-resolution table
  return table;
};

export const selectFileOverviewLevel = (band, queryEnvelope) => {
  const queryWidth = queryEnvelope.maxX - queryEnvelope.minX;
  const queryHeight = queryEnvelope.maxY - queryEnvelope.minY;
  const queryMinDim = Math.min(queryWidth, queryHeight);

  // Native pixel size in degrees (or map units)
  const nativePixelSize = Math.abs(band.ds.geoTransform[1]);

  const ovCount = band.overviews.count();

  for (let i = ovCount - 1; i >= 0; i--) {
    const ov = band.overviews.get(i);
    // Pixel size at this overview level
    const ovPixelSize = nativePixelSize * (band.size.x / ov.size.x);

    // Use this overview only if its pixel covers less than
    // half the query's smallest dimension — ensures multiple
    // pixels fall within the query area
    if (ovPixelSize < queryMinDim / 2) {
      return ov;
    }
  }
  // Query is smaller than even the finest overview pixel —
  // fall back to native resolution
  return band;
};

export const getOverviewPixelSizeM = (aoiAreaM2: number, targetPixels: number): number => {
  const BASE_PIXEL_SIZE_M = 100;
  const OVERVIEWS = [32, 16, 8, 4, 2] as const;
  for (const factor of OVERVIEWS) {
    const pixelSizeM = BASE_PIXEL_SIZE_M * factor;
    if (aoiAreaM2 / pixelSizeM ** 2 >= targetPixels) return pixelSizeM;
  }
  return BASE_PIXEL_SIZE_M;
};

export const envelopeToPixelWindow = (geoTransform: number[], env: Envelope, ovSize: xyz, rasterSize: xyz): PixelWindow | null => {
  const originX = geoTransform[0] ?? 0;
  const pixelW = geoTransform[1] ?? 1;
  const originY = geoTransform[3] ?? 0;
  const pixelH = geoTransform[5] ?? -1; // negative for north-up rasters

  // Scale pixel size from base resolution to this overview's resolution
  const ovPixelW = pixelW * (rasterSize.x / ovSize.x);
  const ovPixelH = pixelH * (rasterSize.y / ovSize.y);

  const colLeft = Math.floor((env.minX - originX) / ovPixelW);
  const rowTop = Math.floor((env.maxY - originY) / ovPixelH); // maxY→small row (north-up)
  const colRight = Math.ceil((env.maxX - originX) / ovPixelW);
  const rowBot = Math.ceil((env.minY - originY) / ovPixelH); // minY→large row

  const x = Math.max(0, colLeft);
  const y = Math.max(0, rowTop);
  const xEnd = Math.min(ovSize.x, colRight);
  const yEnd = Math.min(ovSize.y, rowBot);

  if (xEnd <= x || yEnd <= y) return null;
  return { x, y, w: xEnd - x, h: yEnd - y };
};
