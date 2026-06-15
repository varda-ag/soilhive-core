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

/**
 * Reads raster metadata (nodata, pixel resolution, bbox) via gdalinfo.
 * nodataOverride takes precedence over the value embedded in the file.
 */
export async function analyzeRasterMeta(cogPath: string, nodataOverride?: number): Promise<RasterMeta> {
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

  const nodata: number | null = nodataOverride !== undefined ? nodataOverride : (info.bands?.[0]?.noDataValue ?? null);

  const isGeo = (info.coordinateSystem?.wkt?.includes('GEOGCS') || info.coordinateSystem?.wkt?.includes('GEOGCRS')) ?? true;
  const resolution = Math.round(Math.abs(pixW) * (isGeo ? 111320 : 1));

  const bbox: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [xMin, yMin],
        [xMax, yMin],
        [xMax, yMax],
        [xMin, yMax],
        [xMin, yMin],
      ],
    ],
  };

  return { nodata, resolution, bbox };
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
