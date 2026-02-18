// src/jobs/soil-export/writers/GeoFileWriter.ts

import * as path from 'path';
import * as fs from 'fs';
import * as gdal from 'gdal-async';
import { ExportRecord, FileFormat, EXPORT_SCHEMA, FieldMetadata } from './types';

export class GeoFileWriter {
  private dataset: gdal.Dataset | null = null;
  private currentLayer: gdal.Layer | null = null;
  private outputDir: string = '';
  private fileFormat: FileFormat;
  private layerMap = new Map<string, gdal.Layer>();
  private datasetMap = new Map<string, gdal.Dataset>();

  constructor(fileFormat: FileFormat) {
    this.fileFormat = fileFormat;
  }

  /**
   * Open or create the output file(s).
   * @param outputDir - Directory where files will be written
   */
  async openFile(outputDir: string): Promise<void> {
    this.outputDir = outputDir;

    if (!this.isSingleFileFormat()) {
      // CSV/GeoJSON: files are created per property in setProperty()
      return;
    }

    const filePath = this.buildFilePath();
    const fileExists =
      this.fileFormat === FileFormat.SHP
        ? fs.readdirSync(outputDir).some(f => f.endsWith('.shp')) // check for any .shp file in dir
        : fs.existsSync(filePath); // all other formats

    if (fileExists) {
      this.dataset = gdal.open(filePath, 'r+');

      // Repopulate layerMap from existing layers in the file
      for (let i = 0; i < this.dataset.layers.count(); i++) {
        const layer = this.dataset.layers.get(i);
        this.layerMap.set(layer.name, layer);
      }
    } else {
      const driver = gdal.drivers.get(this.getDriverName());
      this.dataset = driver.create(filePath);
    }
  }

  /**
   * Switch to the sheet/layer/file for the given property.
   * Creates it if it doesn't exist.
   */
  async setProperty(propertyAcronym: string): Promise<void> {
    if (this.isSingleFileFormat()) {
      await this.setPropertySingleFile(propertyAcronym);
    } else {
      await this.setPropertyMultiFile(propertyAcronym);
    }
  }

  async writeRecord(record: ExportRecord): Promise<void> {
    if (!this.currentLayer) {
      throw new Error('GeoFileWriter: No active layer. Call setProperty() first.');
    }

    const feature = new gdal.Feature(this.currentLayer);

    if (record.geom && !this.isTabularFormat()) {
      const geometry = gdal.Geometry.fromWKT(record.geom);
      feature.setGeometry(geometry);
    }

    for (const field of EXPORT_SCHEMA) {
      if (field.key === 'geom') {
        if (this.isTabularFormat()) if (record.geom) feature.fields.set('geom', record.geom);
        continue;
      }
      const fieldName = this.getFieldName(field);

      const value = record[field.key];

      if (value) feature.fields.set(fieldName, value); // <-- only set when value exists
    }

    await this.currentLayer.features.addAsync(feature);
  }

  async closeFile(): Promise<void> {
    if (this.isSingleFileFormat()) {
      if (this.dataset) {
        this.dataset.close();
        this.dataset = null;
      }
    } else {
      for (const [, dataset] of this.datasetMap) {
        dataset.close();
      }
      this.datasetMap.clear();
    }

    this.currentLayer = null;
    this.layerMap.clear();
  }

  // --- Private Helpers ---

  private async setPropertySingleFile(propertyAcronym: string): Promise<void> {
    if (!this.dataset) {
      throw new Error('GeoFileWriter: File not open. Call openFile() first.');
    }

    if (this.layerMap.has(propertyAcronym)) {
      this.currentLayer = this.layerMap.get(propertyAcronym)!;
      return;
    }

    const layer = await this.createLayer(this.dataset, propertyAcronym);
    this.layerMap.set(propertyAcronym, layer);
    this.currentLayer = layer;
  }

  private async setPropertyMultiFile(propertyAcronym: string): Promise<void> {
    const filePath = this.buildPropertyFilePath(propertyAcronym);

    if (this.datasetMap.has(propertyAcronym)) {
      this.currentLayer = this.datasetMap.get(propertyAcronym)!.layers.get(0);
      return;
    }

    let dataset: gdal.Dataset;

    if (fs.existsSync(filePath)) {
      dataset = gdal.open(filePath, 'r+');
      this.currentLayer = dataset.layers.get(0);
    } else {
      const driver = gdal.drivers.get(this.getDriverName());
      dataset = driver.create(filePath);
      this.currentLayer = await this.createLayer(dataset, propertyAcronym);
    }

    this.datasetMap.set(propertyAcronym, dataset);
  }

  private async createLayer(dataset: gdal.Dataset, propertyAcronym: string): Promise<gdal.Layer> {
    let layer: gdal.Layer;

    if (this.isTabularFormat()) {
      layer = dataset.layers.create(propertyAcronym);
    } else {
      const srs = gdal.SpatialReference.fromEPSG(4326);
      layer = dataset.layers.create(propertyAcronym, srs, gdal.wkbPoint);
    }

    for (const field of EXPORT_SCHEMA) {
      if (field.key === 'geom' && !this.isTabularFormat()) continue; // geometry is always handled separately for some formats

      const fieldName = this.getFieldName(field);
      const gdalFieldType = field.gdalType === 'OFTReal' ? gdal.OFTReal : gdal.OFTString;
      layer.fields.add(new gdal.FieldDefn(fieldName, gdalFieldType));
    }

    return layer;
  }

  /**
   * Build file path for single-file formats (XLSX, GPKG, SHP)
   * Uses just the format extension as filename since filterId/timestamp
   * are handled by the zip naming convention
   */
  private buildFilePath(): string {
    if (this.fileFormat === FileFormat.SHP) {
      return this.outputDir; // SHP driver expects directory, not file path
    }
    return path.join(this.outputDir, `export.${this.getFileExtension()}`);
  }

  /**
   * Build file path for multi-file formats (CSV, GeoJSON)
   */
  private buildPropertyFilePath(propertyAcronym: string): string {
    return path.join(this.outputDir, `${propertyAcronym}.${this.getFileExtension()}`);
  }

  private isSingleFileFormat(): boolean {
    return [FileFormat.XLSX, FileFormat.GPKG, FileFormat.SHP].includes(this.fileFormat);
  }

  private isTabularFormat(): boolean {
    return [FileFormat.CSV, FileFormat.XLSX].includes(this.fileFormat);
  }

  private getDriverName(): string {
    switch (this.fileFormat) {
      case FileFormat.CSV:
        return 'CSV';
      case FileFormat.XLSX:
        return 'XLSX';
      case FileFormat.GPKG:
        return 'GPKG';
      case FileFormat.SHP:
        return 'ESRI Shapefile';
      case FileFormat.GEOJSON:
        return 'GeoJSON';
      default:
        throw new Error(`Unsupported format: ${this.fileFormat}`);
    }
  }

  private getFileExtension(): string {
    switch (this.fileFormat) {
      case FileFormat.CSV:
        return 'csv';
      case FileFormat.XLSX:
        return 'xlsx';
      case FileFormat.GPKG:
        return 'gpkg';
      case FileFormat.SHP:
        return 'shp';
      case FileFormat.GEOJSON:
        return 'geojson';
      default:
        throw new Error(`Unsupported format: ${this.fileFormat}`);
    }
  }

  private getFieldName(field: FieldMetadata): string {
    if (this.fileFormat === FileFormat.SHP) {
      return field.title_truncated;
    }

    return field.title;
  }
}
