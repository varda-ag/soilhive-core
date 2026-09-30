import type GeoTIFF from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { fromFile, fromUrl } from 'geotiff';
import type { Polygon } from 'geojson';
import FileService from '../services/FileService';
import ConfigService from '../services/ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI } from './GdalCLI';
import { log } from './logger';
import { getErrorMessage } from './error';

export interface RasterMeta {
  nodata: number | null;
  resolution: number;
  bbox: Polygon;
  epsg?: number;
  wkt?: string;
}

const RESOLUTION_UNAVAILABLE = -1;

const FULL_GLOBE_BBOX: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ],
  ],
};

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

const METRIC_UNIT = /(?:LENGTHUNIT|UNIT)\["met(?:re|er)",\s*1(?:\.0+)?\s*[,\]]/i;

/**
 * Whether a projected CRS's axis unit is already meters, per its WKT (A pixel's ground
 * size is then just its native width/height for an equidistant projection).
 */
export function isMetricProjectedCrs(wkt?: string): boolean {
  return !!wkt && METRIC_UNIT.test(wkt);
}

/**
 * Builds the canonical bbox rectangle — [minX,minY] → [maxX,minY] → [maxX,maxY] → [minX,maxY] →
 * back to [minX,minY] — from the envelope of an arbitrary set of points, regardless of what order
 * they're given in.
 */
function envelopeBbox(points: [number, number][]): Polygon {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

/**
 * Reprojects the raster's own bbox corners to WGS84 directly. Returns null when PROJ can't invert one of the two corners.
 */
async function reprojectBboxCorners(
  wkt: string,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  cogPath: string,
  band: number,
): Promise<Polygon | null> {
  try {
    const corners = await GdalCLI.transformPoints(wkt, [
      [xMin, yMin],
      [xMax, yMax],
    ]);
    if (!corners.flat().every(Number.isFinite)) {
      throw new Error(`reprojected corner(s) not finite: ${JSON.stringify(corners)}`);
    }
    return envelopeBbox(corners);
  } catch (error) {
    log.warn("Could not reproject raster bbox corners either; storing this raster layer's bbox as the whole globe", {
      cogPath,
      band,
      wkt,
      error: getErrorMessage(error),
    });
    return null;
  }
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

  const isGeo = isGeographicCrs(info.coordinateSystem?.wkt);
  let resolution: number;
  if (isGeo) {
    resolution = Math.round(Math.abs(pixW) * 111320);
  } else {
    try {
      const [corner0, corner1] = await GdalCLI.transformPoints(info.coordinateSystem!.wkt!, [
        [xMin, yMax],
        [xMin + pixW, yMax],
      ]);
      const measured = haversineDistanceMeters(corner0!, corner1!);
      if (!Number.isFinite(measured)) {
        throw new Error(`reprojected corner(s) not finite: ${JSON.stringify([corner0, corner1])}`);
      }
      resolution = Math.round(measured);
    } catch (error) {
      if (isMetricProjectedCrs(info.coordinateSystem?.wkt)) {
        resolution = Math.round(Math.abs(pixW));
      } else {
        log.warn('Could not compute raster resolution; storing resolution_m as unavailable', {
          cogPath,
          band,
          wkt: info.coordinateSystem?.wkt,
          error: getErrorMessage(error),
        });
        resolution = RESOLUTION_UNAVAILABLE;
      }
    }
  }

  // raster_layers.bbox is always stored in EPSG:4326, so a raster kept in its native CRS has its
  // extent reprojected here — the same way computeRasterFootprints reprojects footprint geometries
  // — rather than storing native-CRS coordinates mislabeled as degrees.
  const epsg = GdalCLI.extractEpsgFromWkt(info.coordinateSystem?.wkt);
  let bbox: Polygon;
  // A projected CRS always needs reprojecting, whether or not it has a registered EPSG code
  if (!isGeo || (epsg !== undefined && epsg !== 4326)) {
    const wgs84Ring = info.wgs84Extent?.coordinates?.[0];
    if (wgs84Ring && wgs84Ring.length > 0) {
      bbox = envelopeBbox(wgs84Ring as [number, number][]);
    } else {
      // gdalinfo gave up; fall back to reprojecting the raster's own corners directly
      // before falling back to full globe extent.
      bbox = (await reprojectBboxCorners(info.coordinateSystem!.wkt!, xMin, yMin, xMax, yMax, cogPath, band)) ?? FULL_GLOBE_BBOX;
    }
  } else {
    bbox = envelopeBbox([
      [xMin, yMin],
      [xMax, yMax],
    ]);
  }

  return {
    nodata,
    resolution,
    bbox,
    ...(epsg !== undefined && { epsg }),
    ...(info.coordinateSystem?.wkt && { wkt: info.coordinateSystem.wkt }),
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
