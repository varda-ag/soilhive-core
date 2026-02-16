import * as wellknown from 'wellknown';
import { SoilDataSample } from '../../interfaces/SoilDataSample';

/**
 * Supported file formats for soil data export
 */
export enum FileFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
  GPKG = 'gpkg',
  SHP = 'shp',
  GEOJSON = 'geojson',
}

/**
 * Job payload received from pg-boss
 */
export interface SoilExportJobPayload {
  filterId: string;
  datasetSlugs: string[];
  fileFormat: FileFormat;
}

/**
 * Job state stored in pg-boss for progress tracking and resumability
 */
export interface SoilExportJobState {
  status: 'in_progress' | 'completed' | 'failed';
  currentCursor: string | null;
  totalRecordsProcessed: number;
  totalRecordsEstimate: number | null;
  downloadUrl: string | null;
  error: string | null;
}

/**
 * Processed record with formatted fields for export
 */
export interface ExportRecord {
  geom: string; // WKT format:
  dataset_name: string;
  license: string;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
  horizon: string | null;
  value: number;
  unit?: string; // TODO: missing in SoilDataSample
  sample_pretreatment: string | null;
  technique: string | null;
  laboratory_method: string | null;
  extractant_concentration: string | null;
  extraction_ratio: string | null;
  extraction_base: string | null;
  measurement_procedure?: string | null;
  limit_of_detection: string | null;
}

/**
 * Field metadata for export schema
 */
export interface FieldMetadata {
  key: keyof ExportRecord;
  title: string;
  type: 'string' | 'number';
  gdalType?: 'OFTString' | 'OFTReal';
}

/**
 * Centralized export schema - single source of truth
 * Modify this array to add/remove/reorder fields
 */
export const EXPORT_SCHEMA: FieldMetadata[] = [
  { key: 'geom', title: 'geom', type: 'string', gdalType: 'OFTString' },
  { key: 'dataset_name', title: 'dataset_name', type: 'string', gdalType: 'OFTString' },
  { key: 'license', title: 'license', type: 'string', gdalType: 'OFTString' },
  { key: 'sampling_date', title: 'sampling_date', type: 'string', gdalType: 'OFTString' },
  { key: 'min_depth', title: 'min_depth', type: 'number', gdalType: 'OFTReal' },
  { key: 'max_depth', title: 'max_depth', type: 'number', gdalType: 'OFTReal' },
  { key: 'horizon', title: 'horizon', type: 'string', gdalType: 'OFTString' },
  { key: 'value', title: 'value', type: 'number', gdalType: 'OFTReal' },
  { key: 'unit', title: 'unit', type: 'string', gdalType: 'OFTString' }, // TODO: missing in SoilDataSample
  { key: 'sample_pretreatment', title: 'sample_pretreatment', type: 'string', gdalType: 'OFTString' },
  { key: 'technique', title: 'technique', type: 'string', gdalType: 'OFTString' },
  { key: 'laboratory_method', title: 'laboratory_method', type: 'string', gdalType: 'OFTString' }, // TODO: missing in SoilDataSample
  { key: 'extractant_concentration', title: 'extractant_concentration', type: 'string', gdalType: 'OFTString' },
  { key: 'extraction_ratio', title: 'extraction_ratio', type: 'string', gdalType: 'OFTString' },
  { key: 'extraction_base', title: 'extraction_base', type: 'string', gdalType: 'OFTString' },
  { key: 'measurement_procedure', title: 'measurement_procedure', type: 'string', gdalType: 'OFTString' }, // TODO: missing in SoilDataSample
  { key: 'limit_of_detection', title: 'limit_of_detection', type: 'string', gdalType: 'OFTString' },
];

/**
 * Records grouped by property acronym
 */
export interface GroupedRecords {
  [propertyAcronym: string]: ExportRecord[];
}

/**
 * File writer interface for different export formats
 */
export interface IFileWriter {
  /**
   * Open/create file for writing
   * @param filePath - Full path to the file
   * @param propertyAcronym - Property identifier for the file/sheet/layer
   */
  open(filePath: string, propertyAcronym: string): Promise<void>;

  /**
   * Write a single record to the file
   * @param record - The export record to write
   */
  writeRecord(record: ExportRecord): Promise<void>;

  /**
   * Close the file and flush any buffered data
   */
  close(): Promise<void>;
}

/**
 * Configuration constants
 */
export const EXPORT_CONFIG = {
  BATCH_SIZE: 100,
  TEMP_DIR_PREFIX: 'soil-export-',
  EXPORTS_BASE_PATH: 'exports',
  JOB_NAME: 'soil-data-export',
} as const;

/**
 * Helper to convert SoilDataSample to ExportRecord
 */
export function soilSampleToExportRecord(sample: SoilDataSample): ExportRecord {
  // Convert geometry to WKT format
  const geom = sample.geometry ? wellknown.stringify(sample.geometry) || '' : '';

  return {
    geom,
    dataset_name: sample.dataset_name,
    license: sample.license_name,
    sampling_date: sample.sampling_date,
    min_depth: sample.min_depth,
    max_depth: sample.max_depth,
    horizon: sample.horizon,
    value: sample.value,
    sample_pretreatment: sample.sample_pretreatment,
    technique: sample.technique,
    laboratory_method: sample.laboratory_method,
    extractant_concentration: sample.extractant_concentration,
    extraction_ratio: sample.extraction_ratio,
    extraction_base: sample.extraction_base,
    measurement_procedure: sample.measurement_procedure,
    limit_of_detection: sample.limit_of_detection,
  };
}

/**
 * Helper to convert ExportRecord to flat object following schema order
 */
export function recordToOrderedObject(record: ExportRecord): Record<string, any> {
  const result: Record<string, any> = {};
  for (const field of EXPORT_SCHEMA) {
    result[field.key] = record[field.key] ?? null;
  }
  return result;
}
