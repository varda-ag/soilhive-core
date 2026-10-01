import type GeoTIFF from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { fromFile, fromUrl } from 'geotiff';
import type { Polygon } from 'geojson';
import * as turf from '@turf/turf';
import FileService from '../services/FileService';
import ConfigService from '../services/ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI, type Envelope, type GdalInfoOutput } from './GdalCLI';
import { log } from './logger';

export interface RasterMeta {
  nodata: number | null;
  resolution: number;
  bbox: Polygon;
  epsg?: number;
  wkt?: string;
}

const RESOLUTION_UNAVAILABLE = -1;

// Points per side of the lattice sampled across a raster whose corners don't all reproject
const ENVELOPE_SAMPLES_PER_SIDE = 21;

/**
 * Opens a GeoTIFF for reading, handling S3 (presigned URL) and local file paths.
 */
export async function openTiff(storagePath: string): Promise<GeoTIFF> {
  const config = ConfigService.getStorageConfig();
  const { mainFilePath } = await FileService.getMainFilePath(storagePath);
  return config.storageMode === StorageModes.S3 ? fromUrl(await FileService.getPresignedUrl(storagePath)) : fromFile(mainFilePath);
}

/**
 * Reads the nodata value from a geotiff.js image's file directory.
 * Returns NaN when no nodata tag is present.
 */
export function nodataFromImage(image: GeoTIFFImage): number {
  const raw: string | undefined = image.fileDirectory.getValue('GDAL_NODATA');
  return raw === undefined ? Number.NaN : Number.parseFloat(raw);
}

function haversineDistanceMeters([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const earthRadiusM = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

// A CRS's WKT is identified by its outermost keyword: PROJCRS/PROJCS for projected, GEOGCRS/GEOGCS
// for geographic. A projected CRS's WKT2 form wraps a BASEGEOGCRS definition, whose keyword contains
// "GEOGCRS" as a substring, so the projected check must run first.
export function isGeographicCrs(wkt?: string): boolean {
  if (!wkt) return true;
  if (/PROJCRS\[|PROJCS\[/.test(wkt)) return false;
  return /GEOGCRS\[|GEOGCS\[/.test(wkt);
}

// The unit a projected CRS's coordinates are in. WKT2 states it on each AXIS (or once after them
// all) following CS[...]; WKT1 states it as PROJCS's own UNIT, after PROJECTION and its PARAMETERs.
// Every unit before those — the ellipsoid's, a conversion parameter's — measures something else,
// and is in metres even for a CRS whose coordinates are in feet.
const AXIS_UNIT = /(?:\bCS\[|\bPROJECTION\[)[\s\S]*?\b(?:LENGTHUNIT|UNIT)\["([^"]*)",\s*([^,\]\s]+)/;

/**
 * Whether a projected CRS's axis unit is already meters, per its WKT (A pixel's ground
 * size is then just its native width/height for an equidistant projection).
 */
export function isMetricProjectedCrs(wkt?: string): boolean {
  const match = wkt ? AXIS_UNIT.exec(wkt) : null;
  return !!match && /^met(?:re|er)$/i.test(match[1]!) && Number(match[2]) === 1;
}

/**
 * The raster's extent in EPSG:4326, given its native extent in its own CRS's units.
 *
 * raster_layers.bbox is always stored in EPSG:4326, so a raster kept in its native CRS has its
 * extent reprojected here — the same way computeRasterFootprints reprojects footprint geometries
 * — rather than storing native-CRS coordinates mislabeled as degrees.
 *
 * gdalinfo's own wgs84Extent is used when it holds all four corners. An interrupted projection
 * (Goode Homolosine) can leave corners in the gaps between its lobes or off the globe, so a
 * lattice of points across the raster is sampled instead, keeping the envelope of the ones that
 * reproject. Throws when none do: such a raster has no ground to place.
 */
export async function wgs84Envelope(info: GdalInfoOutput, xMin: number, yMin: number, xMax: number, yMax: number): Promise<Envelope> {
  const wkt = info.coordinateSystem?.wkt;
  const epsg = GdalCLI.extractEpsgFromWkt(wkt);
  // A projected CRS always needs reprojecting, whether or not it has a registered EPSG code
  if (isGeographicCrs(wkt) && (epsg === undefined || epsg === 4326)) {
    return [Math.min(xMin, xMax), Math.min(yMin, yMax), Math.max(xMin, xMax), Math.max(yMin, yMax)];
  }

  const fromGdalinfo = GdalCLI.extractWgs84Envelope(info.wgs84Extent);
  if (fromGdalinfo) return fromGdalinfo;

  const n = ENVELOPE_SAMPLES_PER_SIDE;
  const lattice = Array.from({ length: n * n }, (_, k): [number, number] => [
    xMin + ((xMax - xMin) * Math.floor(k / n)) / (n - 1),
    yMin + ((yMax - yMin) * (k % n)) / (n - 1),
  ]);
  const reprojected = (await GdalCLI.transformPoints(wkt!, lattice)).filter(point => point.every(Number.isFinite));
  if (reprojected.length === 0) {
    throw new Error("No point across the raster's extent reprojects to EPSG:4326");
  }
  return turf.bbox(turf.multiPoint(reprojected)) as Envelope;
}

/**
 * Reads raster metadata (nodata, pixel resolution, bbox) via gdalinfo for one band.
 *
 * `resolution` and `bbox` are properties of the file and identical for every band;
 * `nodata` is read from the requested band. `band` is 1-based, matching GDAL.
 */
export async function analyzeRasterMeta(cogPath: string, band: number): Promise<RasterMeta> {
  const { mainFilePath } = await FileService.getMainFilePath(cogPath);
  const info = await GdalCLI.gdalinfo(mainFilePath);

  const gt = info.geoTransform;
  if (!gt) throw new Error('Raster has no geoTransform');

  const [rasterNativeWidth, rasterNativeHeight] = info.size ?? [0, 0];
  const xMin = gt[0]!;
  const yMax = gt[3]!;
  const pixW = gt[1]!;
  const pixH = gt[5]!;
  const xMax = xMin + rasterNativeWidth * pixW;
  const yMin = yMax + rasterNativeHeight * pixH;

  const nodata: number | null = info.bands?.[band - 1]?.noDataValue ?? null;

  const wkt = info.coordinateSystem?.wkt;
  let resolution: number;
  if (isGeographicCrs(wkt)) {
    resolution = Math.round(Math.abs(pixW) * 111320);
  } else {
    // Projected CRS units aren't necessarily meters (e.g. state-plane feet), so measure the ground
    // distance across one pixel — at the raster's centre, since its corners are the likeliest
    // points to fall in a gap of an interrupted projection, or off the globe.
    const centreX = (xMin + xMax) / 2;
    const centreY = (yMin + yMax) / 2;
    const [start, end] = await GdalCLI.transformPoints(wkt!, [
      [centreX, centreY],
      [centreX + pixW, centreY],
    ]);
    const measured = haversineDistanceMeters(start!, end!);
    if (Number.isFinite(measured)) {
      resolution = Math.round(measured);
    } else if (isMetricProjectedCrs(wkt)) {
      log.warn("Could not reproject the raster's centre pixel; storing its native width as resolution_m", { cogPath, band, wkt });
      resolution = Math.round(Math.abs(pixW));
    } else {
      log.warn("Could not reproject the raster's centre pixel; storing resolution_m as unavailable", { cogPath, band, wkt });
      resolution = RESOLUTION_UNAVAILABLE;
    }
  }

  const bbox: Polygon = turf.bboxPolygon(await wgs84Envelope(info, xMin, yMin, xMax, yMax)).geometry;
  const epsg = GdalCLI.extractEpsgFromWkt(wkt);

  return {
    nodata,
    resolution,
    bbox,
    ...(epsg !== undefined && { epsg }),
    ...(wkt && { wkt }),
  };
}

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
  const BASE_PIXEL_SIZE_M = 100;
  const TARGET_PIXELS = 512;
  const OVERVIEWS = [32, 16, 8, 4, 2] as const;

  for (const factor of OVERVIEWS) {
    const pixelSizeM = BASE_PIXEL_SIZE_M * factor;
    const pixelAreaM2 = pixelSizeM ** 2;
    const pixelCount = aoiAreaM2 / pixelAreaM2;
    if (pixelCount >= TARGET_PIXELS) {
      return `o_${factor}_${table}`;
    }
  }

  return table;
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
