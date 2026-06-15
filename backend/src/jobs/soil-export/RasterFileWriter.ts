import * as path from 'path';
import * as fs from 'fs';
import * as turf from '@turf/turf';
import * as wellknown from 'wellknown';
import { fromFile, writeArrayBuffer, GeoTIFFImage } from 'geotiff';
import { Polygon, MultiPolygon } from 'geojson';
import { RasterFileFormat } from './types';
import { FilteredRasterLayer } from '../../interfaces/DatasetFilter';
import FileService from '../../services/FileService';
import { openTiff, nodataFromImage } from '../../utils/raster';
import { sanitizeField } from '../../utils/utils';
import { GdalCLI } from '../../utils/GdalCLI';

const TILE_SIZE = 512;

interface TileWriteContext {
  sourceImage: GeoTIFFImage;
  maskImage: GeoTIFFImage;
  output: Float32Array;
  outW: number;
  outH: number;
  srcOffX: number;
  srcOffY: number;
  outMinX: number;
  outMaxY: number;
  srcPixW: number;
  srcPixH: number;
  maskMinX: number;
  maskMaxY: number;
  maskPixW: number;
  maskPixH: number;
  maskW: number;
  maskH: number;
}

const fileService = new FileService();

export class RasterFileWriter {
  private readonly outputDir: string;
  private readonly fileFormat: RasterFileFormat;

  constructor(fileFormat: RasterFileFormat, outputDir: string) {
    this.fileFormat = fileFormat;
    this.outputDir = outputDir;
  }

  /**
   * Clips the source raster layer to the AOI and writes it to the output directory.
   * Output layer naming convention is {outputDir}/{dataset_slug}_{soil_property}{_depth}{_date}
   */
  async writeLayerAoi(layer: FilteredRasterLayer, aoi: Polygon | MultiPolygon): Promise<void> {
    const fileExists = await fileService.exists(layer.path);
    if (!fileExists) {
      throw new Error(`Requested raster layer not found in storage: ${layer.path}`);
    }
    const [minX, minY, maxX, maxY] = turf.bbox(aoi);
    const layerName = this.buildLayerName(layer);
    fs.mkdirSync(path.dirname(this.outputDir), { recursive: true });

    const { mainFilePath } = await FileService.getMainFilePath(layer.path);
    const wkt = wellknown.stringify(aoi);

    const warpArgs: string[] = [
      '-cutline_srs',
      'EPSG:4326',
      '-cutline',
      wkt,
      '-te',
      String(minX),
      String(minY),
      String(maxX),
      String(maxY),
      '-te_srs',
      'EPSG:4326',
      '-of',
      this.getDriverName(),
      '-crop_to_cutline',
    ];

    if (this.fileFormat === RasterFileFormat.TIFF) {
      warpArgs.push('-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES');
    } else {
      warpArgs.push('-co', `RASTER_TABLE=${layerName}`, '-co', 'TILE_FORMAT=TIFF', '-ot', 'Float32');
    }

    const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
    await GdalCLI.warp(mainFilePath, filePath, warpArgs);
  }

  /**
   * Clips the source raster layer using a raster mask file (from getRasterMask output='file').
   * Reads both source and mask in TILE_SIZE×TILE_SIZE windows for low memory usage.
   * Output extent = intersection of source bbox and mask bbox, at source resolution.
   */
  async writeLayer(layer: FilteredRasterLayer, rasterMaskFile: string): Promise<void> {
    const sourceTiff = await openTiff(layer.path);
    const maskTiff = await fromFile(rasterMaskFile);

    const sourceImage = await sourceTiff.getImage(0);
    const maskImage = await maskTiff.getImage(0);

    const [srcMinX, srcMinY, srcMaxX, srcMaxY] = sourceImage.getBoundingBox() as [number, number, number, number];
    const [maskMinX, maskMinY, maskMaxX, maskMaxY] = maskImage.getBoundingBox() as [number, number, number, number];
    const srcW = sourceImage.getWidth();
    const srcH = sourceImage.getHeight();
    const maskW = maskImage.getWidth();
    const maskH = maskImage.getHeight();

    const outMinX = Math.max(srcMinX, maskMinX);
    const outMinY = Math.max(srcMinY, maskMinY);
    const outMaxX = Math.min(srcMaxX, maskMaxX);
    const outMaxY = Math.min(srcMaxY, maskMaxY);
    if (outMinX >= outMaxX || outMinY >= outMaxY) return;

    const srcPixW = (srcMaxX - srcMinX) / srcW;
    const srcPixH = (srcMaxY - srcMinY) / srcH;
    const maskPixW = (maskMaxX - maskMinX) / maskW;
    const maskPixH = (maskMaxY - maskMinY) / maskH;

    const outW = Math.ceil((outMaxX - outMinX) / srcPixW);
    const outH = Math.ceil((outMaxY - outMinY) / srcPixH);

    // Top-left pixel of the output extent in source pixel space
    const srcOffX = Math.floor((outMinX - srcMinX) / srcPixW);
    const srcOffY = Math.floor((srcMaxY - outMaxY) / srcPixH);

    const nodata = nodataFromImage(sourceImage);
    const nodataFill = Number.isNaN(nodata) ? Number.NaN : nodata;

    const output = new Float32Array(outW * outH).fill(nodataFill);

    const ctx: TileWriteContext = {
      sourceImage,
      maskImage,
      output,
      outW,
      outH,
      srcOffX,
      srcOffY,
      outMinX,
      outMaxY,
      srcPixW,
      srcPixH,
      maskMinX,
      maskMaxY,
      maskPixW,
      maskPixH,
      maskW,
      maskH,
    };
    for (let tileY = 0; tileY < outH; tileY += TILE_SIZE) {
      for (let tileX = 0; tileX < outW; tileX += TILE_SIZE) {
        await this.applyTile(ctx, tileX, tileY);
      }
    }

    const nodataStr = Number.isNaN(nodata) ? 'nan' : String(nodata);
    const ab = writeArrayBuffer(output, {
      height: outH,
      width: outW,
      SamplesPerPixel: 1,
      BitsPerSample: [32],
      SampleFormat: [3], // IEEE float
      GDAL_NODATA: nodataStr,
      GTModelTypeGeoKey: 2, // ModelTypeGeographic
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      GeographicTypeGeoKey: 4326,
      GeogCitationGeoKey: 'WGS 84',
      ModelTiepoint: [0, 0, 0, outMinX, outMaxY, 0],
      ModelPixelScale: [srcPixW, srcPixH, 0],
    });

    const layerName = this.buildLayerName(layer);
    fs.mkdirSync(this.outputDir, { recursive: true });
    const tempPath = path.join(this.outputDir, `${layerName}.masked.tmp.tif`);
    fs.writeFileSync(tempPath, Buffer.from(ab));

    try {
      const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
      if (this.fileFormat === RasterFileFormat.TIFF) {
        await GdalCLI.translate(tempPath, filePath, ['-of', 'GTiff', '-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', '-ot', 'Float32']);
      } else {
        await GdalCLI.translate(tempPath, filePath, [
          '-of',
          'GPKG',
          '-b',
          '1',
          '-co',
          `RASTER_TABLE=${layerName}`,
          '-co',
          'TILE_FORMAT=TIFF',
          '-ot',
          'Float32',
        ]);
      }
    } finally {
      fs.unlinkSync(tempPath);
    }
  }

  private async applyTile(ctx: TileWriteContext, tileX: number, tileY: number): Promise<void> {
    const {
      sourceImage,
      maskImage,
      output,
      outW,
      outH,
      srcOffX,
      srcOffY,
      outMinX,
      outMaxY,
      srcPixW,
      srcPixH,
      maskMinX,
      maskMaxY,
      maskPixW,
      maskPixH,
      maskW,
      maskH,
    } = ctx;
    const tw = Math.min(TILE_SIZE, outW - tileX);
    const th = Math.min(TILE_SIZE, outH - tileY);

    const srcRasters = await sourceImage.readRasters({
      window: [srcOffX + tileX, srcOffY + tileY, srcOffX + tileX + tw, srcOffY + tileY + th],
      samples: [0],
    });
    const srcData = srcRasters[0] as ArrayLike<number>;

    // Tile geo-extent used to map into mask pixel space
    const tileGeoXMin = outMinX + tileX * srcPixW;
    const tileGeoYMax = outMaxY - tileY * srcPixH;
    const tileGeoXMax = tileGeoXMin + tw * srcPixW;
    const tileGeoYMin = tileGeoYMax - th * srcPixH;

    const mxStart = Math.max(0, Math.floor((tileGeoXMin - maskMinX) / maskPixW));
    const myStart = Math.max(0, Math.floor((maskMaxY - tileGeoYMax) / maskPixH));
    const mxEnd = Math.min(maskW, Math.ceil((tileGeoXMax - maskMinX) / maskPixW));
    const myEnd = Math.min(maskH, Math.ceil((maskMaxY - tileGeoYMin) / maskPixH));

    const maskRasters = await maskImage.readRasters({
      window: [mxStart, myStart, mxEnd, myEnd],
      samples: [0],
      width: tw,
      height: th,
    });
    const maskData = maskRasters[0] as ArrayLike<number>;

    for (let i = 0; i < tw * th; i++) {
      if (maskData[i]) {
        output[(tileY + Math.floor(i / tw)) * outW + (tileX + (i % tw))] = srcData[i] as number;
      }
    }
  }

  private buildLayerName(layer: FilteredRasterLayer): string {
    const depthPart = layer.min_depth !== null && layer.max_depth !== null ? `_${layer.min_depth}-${layer.max_depth}cm` : '';
    let datePart = '';
    if (layer.reference_period_start !== null && layer.reference_period_stop !== null) {
      datePart = `_${layer.reference_period_start}-${layer.reference_period_stop}`;
    } else if (layer.reference_period_start !== null) {
      datePart = `_${layer.reference_period_start}`;
    }
    return `${sanitizeField(layer.dataset_name)}_${sanitizeField(layer.soil_property_name)}${depthPart}${datePart}`;
  }

  private getDriverName(): string {
    switch (this.fileFormat) {
      case RasterFileFormat.TIFF:
        return 'GTiff';
      case RasterFileFormat.GPKG:
        return 'GPKG';
      default:
        throw new Error(`Unsupported raster format: ${this.fileFormat}`);
    }
  }

  private getFileExtension(): string {
    switch (this.fileFormat) {
      case RasterFileFormat.TIFF:
        return 'tif';
      case RasterFileFormat.GPKG:
        return 'gpkg';
      default:
        throw new Error(`Unsupported raster format: ${this.fileFormat}`);
    }
  }
}
