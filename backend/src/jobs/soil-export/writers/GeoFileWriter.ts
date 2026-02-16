// src/jobs/soil-export/writers/GeoFileWriter.ts

import * as gdal from 'gdal-async';
import { IFileWriter, ExportRecord, FileFormat } from '../types';
import { EXPORT_SCHEMA } from './../types';

export class GeoFileWriter implements IFileWriter {
  private dataset: gdal.Dataset | null = null;
  private layer: gdal.Layer | null = null;
  private filePath: string = '';
  private propertyAcronym: string = '';
  private fileFormat: FileFormat;

  constructor(fileFormat: FileFormat) {
    this.fileFormat = fileFormat;
  }

  async open(filePath: string, propertyAcronym: string): Promise<void> {
    this.filePath = filePath;
    this.propertyAcronym = propertyAcronym;

    const driverName = this.getDriverName();
    this.dataset = await gdal.openAsync(filePath, 'w', driverName);

    const srs = gdal.SpatialReference.fromEPSG(4326);
    this.layer = await this.dataset.layers.createAsync(propertyAcronym, srs, gdal.wkbPoint);

    // Dynamically create fields from schema (skip geometry field)
    for (const field of EXPORT_SCHEMA) {
      if (field.key === 'geom') continue; // Geometry handled separately

      const fieldName = this.truncateFieldName(field.title);
      const gdalFieldType = field.gdalType === 'OFTReal' ? gdal.OFTReal : gdal.OFTString;
      this.layer.fields.add(new gdal.FieldDefn(fieldName, gdalFieldType));
    }
  }

  async writeRecord(record: ExportRecord): Promise<void> {
    if (!this.layer) {
      throw new Error('GeoFileWriter: Writer not opened');
    }

    const feature = new gdal.Feature(this.layer);

    // Set geometry
    if (record.geom) {
      const geometry = gdal.Geometry.fromWKT(record.geom);
      feature.setGeometry(geometry);
    }

    // Dynamically set attributes from schema
    for (const field of EXPORT_SCHEMA) {
      if (field.key === 'geom') continue;

      const fieldName = this.truncateFieldName(field.title);
      const value = record[field.key] ?? null;
      feature.fields.set(fieldName, value);
    }

    await this.layer.features.addAsync(feature);
  }

  async close(): Promise<void> {
    if (this.dataset) {
      await this.dataset.close();
      this.dataset = null;
      this.layer = null;
    }
  }

  private getDriverName(): string {
    switch (this.fileFormat) {
      case FileFormat.GPKG:
        return 'GPKG';
      case FileFormat.SHP:
        return 'ESRI Shapefile';
      case FileFormat.GEOJSON:
        return 'GeoJSON';
      default:
        throw new Error(`Unsupported geo format: ${this.fileFormat}`);
    }
  }

  /**
   * Truncate field names for shapefile compatibility (10 char limit)
   */
  private truncateFieldName(name: string): string {
    if (this.fileFormat === FileFormat.SHP && name.length > 10) {
      return name.substring(0, 10);
    }
    return name;
  }
}
