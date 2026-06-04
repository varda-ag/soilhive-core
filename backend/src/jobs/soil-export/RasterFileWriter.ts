import * as path from 'path';
import * as fs from 'fs';
import * as turf from '@turf/turf';
import * as wellknown from 'wellknown';
import { Polygon, MultiPolygon } from 'geojson';
import { RasterFileFormat } from './types';
import { FilteredRasterLayer } from '../../interfaces/DatasetFilter';
import FileService from '../../services/FileService';
import { sanitizeField } from '../../utils/utils';
import { GdalCLI } from '../../utils/GdalCLI';

export class RasterFileWriter {
  private outputDir: string;
  private fileFormat: RasterFileFormat;

  constructor(fileFormat: RasterFileFormat, outputDir: string) {
    this.fileFormat = fileFormat;
    this.outputDir = outputDir;
  }

  /**
   * Clips the source raster layer to the AOI and writes it to the output directory.
   * Output layer naming convention is {outputDir}/{dataset_slug}_{soil_property}{_depth}{_date}
   */
  async writeLayer(layer: FilteredRasterLayer, aoi: Polygon | MultiPolygon): Promise<void> {
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
      warpArgs.push('-co', `RASTER_TABLE=${layerName}`, '-co', 'COMPRESS=LZW', '-co', 'TILE_FORMAT=TIFF', '-ot', 'Float32');
    }

    const filePath = path.join(this.outputDir, `${layerName}.${this.getFileExtension()}`);
    await GdalCLI.warp(mainFilePath, filePath, warpArgs);
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
