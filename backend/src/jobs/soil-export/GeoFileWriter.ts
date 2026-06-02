// src/jobs/soil-export/writers/GeoFileWriter.ts

import * as path from 'path';
import * as fs from 'fs';
import * as wellknown from 'wellknown';
import { ExportRecord, FileFormat, EXPORT_SCHEMA, FieldMetadata } from './types';
import { GdalCLI } from '../../utils/GdalCLI';

export class GeoFileWriter {
  private outputDir: string = '';
  private fileFormat: FileFormat;
  private createdLayers = new Set<string>();
  private batchBuffer = new Map<string, ExportRecord[]>();
  private currentPropertyAcronym: string | null = null;

  constructor(fileFormat: FileFormat) {
    this.fileFormat = fileFormat;
  }

  async openFile(outputDir: string): Promise<void> {
    this.outputDir = outputDir;
    this.batchBuffer = new Map();
    this.currentPropertyAcronym = null;
  }

  async setProperty(propertyAcronym: string): Promise<void> {
    this.currentPropertyAcronym = propertyAcronym;
    if (!this.batchBuffer.has(propertyAcronym)) {
      this.batchBuffer.set(propertyAcronym, []);
    }
  }

  async writeRecord(record: ExportRecord): Promise<void> {
    if (!this.currentPropertyAcronym) {
      throw new Error('GeoFileWriter: No active layer. Call setProperty() first.');
    }
    this.batchBuffer.get(this.currentPropertyAcronym)!.push(record);
  }

  async closeFile(): Promise<void> {
    for (const [propertyAcronym, records] of this.batchBuffer) {
      if (records.length === 0) continue;

      const batchPath = path.join(this.outputDir, `_batch_${propertyAcronym}.geojson`);
      const featureCollection = this.buildFeatureCollection(records);
      fs.writeFileSync(batchPath, JSON.stringify(featureCollection));

      try {
        await GdalCLI.ogr2ogr(this.buildOgr2ogrArgs(propertyAcronym, batchPath));
      } finally {
        fs.unlinkSync(batchPath);
      }

      this.createdLayers.add(propertyAcronym);
    }

    this.batchBuffer = new Map();
    this.currentPropertyAcronym = null;
  }

  // --- Private Helpers ---

  private buildFeatureCollection(records: ExportRecord[]): object {
    return {
      type: 'FeatureCollection',
      features: records.map(record => ({
        type: 'Feature',
        geometry: this.isTabularFormat() ? null : wellknown.parse(record.geom),
        properties: this.buildProperties(record),
      })),
    };
  }

  private buildProperties(record: ExportRecord): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const field of EXPORT_SCHEMA) {
      if (field.key === 'geom' && !this.isTabularFormat()) continue;
      props[this.getFieldName(field)] = record[field.key] ?? null;
    }
    return props;
  }

  private buildOgr2ogrArgs(propertyAcronym: string, batchPath: string): string[] {
    const isExistingLayer = this.createdLayers.has(propertyAcronym);
    const isExistingFile = this.isSingleFileFormat() && this.createdLayers.size > 0;
    const outputPath = this.getOutputPath(propertyAcronym);

    const args: string[] = [];

    if (isExistingLayer) {
      args.push('-update', '-append');
    } else if (isExistingFile) {
      args.push('-update');
    }

    if (this.fileFormat === FileFormat.SHP) {
      args.push('-f', 'ESRI Shapefile');
    } else if (this.fileFormat === FileFormat.CSV) {
      args.push('-f', 'CSV');
    } else if (this.fileFormat === FileFormat.GEOJSON) {
      args.push('-f', 'GeoJSON');
    }

    args.push(outputPath, batchPath, '-nln', propertyAcronym);

    if (!this.isTabularFormat() && !isExistingLayer) {
      args.push('-a_srs', 'EPSG:4326');
    }

    return args;
  }

  private getOutputPath(propertyAcronym: string): string {
    if (this.isSingleFileFormat()) {
      return this.buildFilePath();
    }
    return this.buildPropertyFilePath(propertyAcronym);
  }

  private buildFilePath(): string {
    if (this.fileFormat === FileFormat.SHP) {
      return this.outputDir;
    }
    return path.join(this.outputDir, `export.${this.getFileExtension()}`);
  }

  private buildPropertyFilePath(propertyAcronym: string): string {
    return path.join(this.outputDir, `${propertyAcronym}.${this.getFileExtension()}`);
  }

  private isSingleFileFormat(): boolean {
    return [FileFormat.XLSX, FileFormat.GPKG, FileFormat.SHP].includes(this.fileFormat);
  }

  private isTabularFormat(): boolean {
    return [FileFormat.CSV, FileFormat.XLSX].includes(this.fileFormat);
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
