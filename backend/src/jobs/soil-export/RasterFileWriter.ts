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
  nodataFill: number;
  nodataStr: string;
  layerName: string;
}

interface TilePlacement {
  filePath: string;
  tileX: number;
  tileY: number;
  tw: number;
  th: number;
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
   * Reads source and mask in TILE_SIZE×TILE_SIZE windows to bound per-tile memory usage.
   * Each tile is written to a temp TIFF on disk; a VRT mosaics them for the final gdal_translate.
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
    const nodataStr = Number.isNaN(nodata) ? 'nan' : String(nodata);
    const layerName = this.buildLayerName(layer);

    fs.mkdirSync(this.outputDir, { recursive: true });

    const ctx: TileWriteContext = {
      sourceImage,
      maskImage,
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
      nodataFill,
      nodataStr,
      layerName,
    };

    const tiles: TilePlacement[] = [];
    try {
      for (let tileY = 0; tileY < outH; tileY += TILE_SIZE) {
        for (let tileX = 0; tileX < outW; tileX += TILE_SIZE) {
          const tw = Math.min(TILE_SIZE, outW - tileX);
          const th = Math.min(TILE_SIZE, outH - tileY);
          const tilePath = await this.writeTile(ctx, tileX, tileY, tw, th);
          if (tilePath) tiles.push({ filePath: tilePath, tileX, tileY, tw, th });
        }
      }

      if (tiles.length === 0) return;

      const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
      const vrtPath = path.join(this.outputDir, `${layerName}.tmp.vrt`);
      fs.writeFileSync(vrtPath, this.buildVrt(tiles, outW, outH, outMinX, outMaxY, srcPixW, srcPixH, nodataStr));

      try {
        if (this.fileFormat === RasterFileFormat.TIFF) {
          await GdalCLI.translate(vrtPath, filePath, ['-of', 'GTiff', '-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', '-ot', 'Float32']);
        } else {
          await GdalCLI.translate(vrtPath, filePath, [
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
        fs.unlinkSync(vrtPath);
      }
    } finally {
      for (const tile of tiles) {
        try {
          fs.unlinkSync(tile.filePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private async writeTile(ctx: TileWriteContext, tileX: number, tileY: number, tw: number, th: number): Promise<string | null> {
    const {
      sourceImage,
      maskImage,
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
      nodataFill,
      nodataStr,
      layerName,
    } = ctx;

    const srcRasters = await sourceImage.readRasters({
      window: [srcOffX + tileX, srcOffY + tileY, srcOffX + tileX + tw, srcOffY + tileY + th],
      samples: [0],
    });
    const srcData = srcRasters[0] as ArrayLike<number>;

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

    const tileData = new Float32Array(tw * th).fill(nodataFill);
    let hasValid = false;
    for (let i = 0; i < tw * th; i++) {
      if (maskData[i]) {
        tileData[i] = srcData[i] as number;
        hasValid = true;
      }
    }
    if (!hasValid) return null;

    const ab = writeArrayBuffer(tileData, {
      height: th,
      width: tw,
      SamplesPerPixel: 1,
      BitsPerSample: [32],
      SampleFormat: [3], // IEEE float
      GDAL_NODATA: nodataStr,
      GTModelTypeGeoKey: 2, // ModelTypeGeographic
      GTRasterTypeGeoKey: 1, // RasterPixelIsArea
      GeographicTypeGeoKey: 4326,
      GeogCitationGeoKey: 'WGS 84',
      ModelTiepoint: [0, 0, 0, tileGeoXMin, tileGeoYMax, 0],
      ModelPixelScale: [srcPixW, srcPixH, 0],
    });

    const tilePath = path.join(this.outputDir, `${layerName}.tile_${tileY}_${tileX}.tmp.tif`);
    fs.writeFileSync(tilePath, Buffer.from(ab));
    return tilePath;
  }

  private buildVrt(
    tiles: TilePlacement[],
    outW: number,
    outH: number,
    xMin: number,
    yMax: number,
    pixW: number,
    pixH: number,
    nodataStr: string,
  ): string {
    const sources = tiles
      .map(
        t => `    <SimpleSource>
      <SourceFilename relativeToVRT="0">${t.filePath}</SourceFilename>
      <SourceBand>1</SourceBand>
      <SourceProperties RasterXSize="${t.tw}" RasterYSize="${t.th}" DataType="Float32" BlockXSize="${t.tw}" BlockYSize="1"/>
      <SrcRect xOff="0" yOff="0" xSize="${t.tw}" ySize="${t.th}"/>
      <DstRect xOff="${t.tileX}" yOff="${t.tileY}" xSize="${t.tw}" ySize="${t.th}"/>
    </SimpleSource>`,
      )
      .join('\n');
    return `<VRTDataset rasterXSize="${outW}" rasterYSize="${outH}">
  <SRS dataAxisToSRSAxisMapping="2,1">GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]</SRS>
  <GeoTransform>${xMin}, ${pixW}, 0.0, ${yMax}, 0.0, ${-pixH}</GeoTransform>
  <VRTRasterBand dataType="Float32" band="1">
    <NoDataValue>${nodataStr}</NoDataValue>
${sources}
  </VRTRasterBand>
</VRTDataset>`;
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
