import type GeoTIFF from 'geotiff';
import type { GeoTIFFImage } from 'geotiff';
import { fromFile, fromUrl } from 'geotiff';
import type { Polygon } from 'geojson';
import FileService from '../services/FileService';
import ConfigService from '../services/ConfigService';
import { StorageModes } from '../types/enums';
import { GdalCLI } from './GdalCLI';

export interface RasterMeta {
  nodata: number | null;
  resolution: number;
  bbox: Polygon;
  epsg?: number;
  wkt?: string;
}

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
    // Projected CRS units aren't necessarily meters (e.g. state-plane feet), so measure the ground
    // distance between two adjacent pixel corners .
    const [corner0, corner1] = await GdalCLI.transformPoints(info.coordinateSystem!.wkt!, [
      [xMin, yMax],
      [xMin + pixW, yMax],
    ]);
    resolution = Math.round(haversineDistanceMeters(corner0!, corner1!));
  }

  // raster_layers.bbox is always stored in EPSG:4326, so a raster kept in its native CRS (see
  // RasterIngestService.checkFileFormat, which no longer warps non-4326 rasters at ingest) has its
  // extent reprojected here — the same way computeRasterFootprints reprojects footprint geometries
  // — rather than storing native-CRS coordinates mislabeled as degrees.
  const epsg = GdalCLI.extractEpsgFromWkt(info.coordinateSystem?.wkt);
  let bboxMinX = xMin;
  let bboxMinY = yMin;
  let bboxMaxX = xMax;
  let bboxMaxY = yMax;
  // A projected CRS always needs reprojecting, whether or not it has a registered EPSG code
  if (!isGeo || (epsg !== undefined && epsg !== 4326)) {
    const corners = await GdalCLI.transformPoints(info.coordinateSystem!.wkt!, [
      [xMin, yMin],
      [xMax, yMax],
    ]);
    [bboxMinX, bboxMinY] = corners[0]!;
    [bboxMaxX, bboxMaxY] = corners[1]!;
  }

  const bbox: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [bboxMinX, bboxMinY],
        [bboxMaxX, bboxMinY],
        [bboxMaxX, bboxMaxY],
        [bboxMinX, bboxMaxY],
        [bboxMinX, bboxMinY],
      ],
    ],
  };

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
