import * as gdal from 'gdal-async';
import type { MultiPolygon, Polygon } from 'geojson';
import FileService from '../services/FileService';

const MAX_TILES = 256 * 256;
const MIN_TILES = 256;
// Minimum number of overview pixels along each tile dimension for polygon precision.
// Higher = finer polygons but more computation.
const PIXELS_PER_TILE_MIN_DIM = 512;
const INSERT_BATCH_SIZE = 10;

export interface RasterFootprintMeta {
  nodata: number | null;
  resolution: number;
  bbox: Polygon;
}

export type FootprintBatchCallback = (tiles: MultiPolygon[]) => Promise<void>;

function computeGrid(rasterWidth: number, rasterHeight: number): { nCols: number; nRows: number } {
  const rasterArea = rasterWidth * rasterHeight;
  const earthArea = 360 * 180;
  const targetTiles = Math.max(MIN_TILES, Math.min(MAX_TILES, Math.round((rasterArea / earthArea) * MAX_TILES)));
  const nCols = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterWidth / rasterHeight))));
  const nRows = Math.max(1, Math.round(Math.sqrt(targetTiles * (rasterHeight / rasterWidth))));
  return { nCols, nRows };
}

function selectOverview(
  band: gdal.RasterBand,
  nativeWidth: number,
  nativeHeight: number,
  tileMinDim: number,
  nativePixelSize: number,
): { selectedBand: gdal.RasterBand; ovWidth: number; ovHeight: number } {
  const ovCount = band.overviews.count();
  let selectedBand: gdal.RasterBand = band;
  let ovWidth = nativeWidth;
  let ovHeight = nativeHeight;

  for (let i = ovCount - 1; i >= 0; i--) {
    const ov = band.overviews.get(i);
    const ovPixelSize = nativePixelSize * (nativeWidth / ov.size.x);
    if (ovPixelSize < tileMinDim / PIXELS_PER_TILE_MIN_DIM) {
      selectedBand = ov;
      ovWidth = ov.size.x;
      ovHeight = ov.size.y;
      break;
    }
  }

  // No overview satisfied criterion — use finest available to avoid full-res reads
  if (selectedBand === band && ovCount > 0) {
    const finest = band.overviews.get(0);
    selectedBand = finest;
    ovWidth = finest.size.x;
    ovHeight = finest.size.y;
  }

  return { selectedBand, ovWidth, ovHeight };
}

export async function analyzeRasterMeta(cogPath: string, nodataOverride?: number): Promise<RasterFootprintMeta> {
  const { mainFilePath } = await FileService.getMainFilePath(cogPath);
  const ds = await gdal.openAsync(mainFilePath);
  try {
    const gt = ds.geoTransform;
    if (!gt) throw new Error('Raster has no geoTransform');

    const rasterNativeWidth = ds.rasterSize.x;
    const rasterNativeHeight = ds.rasterSize.y;

    const xMin = gt[0]!;
    const yMax = gt[3]!;
    const xMax = xMin + rasterNativeWidth * gt[1]!;
    const yMin = yMax + rasterNativeHeight * gt[5]!;

    const band = await ds.bands.getAsync(1);
    const nodata: number | null = nodataOverride !== undefined ? nodataOverride : (band.noDataValue ?? null);

    const nativePixelSize = Math.abs(gt[1]!);
    const isGeo = ds.srs?.isGeographic() ?? true;
    const resolution = Math.round(nativePixelSize * (isGeo ? 111320 : 1));

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
  } finally {
    ds.close();
  }
}

export async function streamRasterFootprints(
  cogPath: string,
  nodataOverride: number | undefined,
  onBatch: FootprintBatchCallback,
): Promise<void> {
  const { mainFilePath } = await FileService.getMainFilePath(cogPath);
  const ds = await gdal.openAsync(mainFilePath);
  try {
    const gt = ds.geoTransform;
    if (!gt) throw new Error('Raster has no geoTransform');

    const rasterNativeWidth = ds.rasterSize.x;
    const rasterNativeHeight = ds.rasterSize.y;

    const xMin = gt[0]!;
    const yMax = gt[3]!;
    const xMax = xMin + rasterNativeWidth * gt[1]!;
    const yMin = yMax + rasterNativeHeight * gt[5]!;

    const rasterWidthDeg = xMax - xMin;
    const rasterHeightDeg = yMax - yMin;

    const band = await ds.bands.getAsync(1);
    const nodata: number | null = nodataOverride !== undefined ? nodataOverride : (band.noDataValue ?? null);
    const nativePixelSize = Math.abs(gt[1]!);

    const { nCols, nRows } = computeGrid(rasterWidthDeg, rasterHeightDeg);
    const tileW = rasterWidthDeg / nCols;
    const tileH = rasterHeightDeg / nRows;

    // Overview selection is uniform across all tiles (same tile dimensions throughout).
    const tileMinDim = Math.min(tileW, tileH);
    const { selectedBand, ovWidth, ovHeight } = selectOverview(band, rasterNativeWidth, rasterNativeHeight, tileMinDim, nativePixelSize);
    const ovPixelW = rasterWidthDeg / ovWidth;
    const ovPixelH = rasterHeightDeg / ovHeight;

    const memDriver = gdal.drivers.get('MEM');
    const ogrDriver = gdal.drivers.get('Memory');

    let batch: MultiPolygon[] = [];

    for (let iRow = 0; iRow < nRows; iRow++) {
      for (let iCol = 0; iCol < nCols; iCol++) {
        const tileXMin = xMin + iCol * tileW;
        const tileXMax = xMin + (iCol + 1) * tileW;
        const tileYMax = yMax - iRow * tileH;
        const tileYMin = yMax - (iRow + 1) * tileH;

        // Map tile geographic bounds to overview pixel window
        const pxStart = Math.max(0, Math.floor((tileXMin - xMin) / ovPixelW));
        const pxEnd = Math.min(ovWidth, Math.ceil((tileXMax - xMin) / ovPixelW));
        const pyStart = Math.max(0, Math.floor((yMax - tileYMax) / ovPixelH));
        const pyEnd = Math.min(ovHeight, Math.ceil((yMax - tileYMin) / ovPixelH));

        const tilePixW = pxEnd - pxStart;
        const tilePixH = pyEnd - pyStart;
        if (tilePixW <= 0 || tilePixH <= 0) continue;

        const rawData = await selectedBand.pixels.readAsync(pxStart, pyStart, tilePixW, tilePixH);

        // Build binary mask: 1 = valid pixel, 0 = nodata/NaN
        const mask = new Uint8Array(tilePixW * tilePixH);
        let hasValid = false;
        for (let i = 0; i < rawData.length; i++) {
          const v = rawData[i] as number;
          const valid = !Number.isNaN(v) && (nodata === null || v !== nodata);
          if (valid) {
            mask[i] = 1;
            hasValid = true;
          }
        }
        if (!hasValid) continue;

        // Geotransform for the tile's pixel window in geographic space
        const tileGeoXMin = xMin + pxStart * ovPixelW;
        const tileGeoYMax = yMax - pyStart * ovPixelH;

        // Create in-memory raster with the binary mask
        const memDs = memDriver.create('', tilePixW, tilePixH, 1, gdal.GDT_Byte);
        memDs.geoTransform = [tileGeoXMin, ovPixelW, 0, tileGeoYMax, 0, -ovPixelH];
        memDs.srs = gdal.SpatialReference.fromEPSG(4326);
        const maskBand = memDs.bands.get(1);
        maskBand.pixels.write(0, 0, tilePixW, tilePixH, mask);

        // Polygonize into an in-memory OGR layer
        const ogrDs = ogrDriver.create('');
        const layer = ogrDs.layers.create('fp', gdal.SpatialReference.fromEPSG(4326), gdal.wkbPolygon);
        layer.fields.add(new gdal.FieldDefn('val', gdal.OFTInteger));
        await gdal.polygonizeAsync({ src: maskBand, dst: layer, pixValField: 0, connectedness: 8 });

        // Collect all val=1 polygons into a MultiPolygon
        const polygonCoords: MultiPolygon['coordinates'] = [];
        layer.features.forEach(feature => {
          if (feature.fields.get('val') === 1) {
            const geom = feature.getGeometry();
            if (geom) {
              const parsed = JSON.parse(geom.toJSON()) as { coordinates: number[][][] };
              polygonCoords.push(parsed.coordinates);
            }
          }
        });

        memDs.close();
        ogrDs.close();

        if (polygonCoords.length === 0) continue;

        batch.push({ type: 'MultiPolygon', coordinates: polygonCoords });

        if (batch.length >= INSERT_BATCH_SIZE) {
          await onBatch(batch);
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      await onBatch(batch);
    }
  } finally {
    ds.close();
  }
}
