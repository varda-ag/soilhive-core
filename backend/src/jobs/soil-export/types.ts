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
 * Processed record with formatted fields for export
 */
export interface ExportRecord {
  geom: string; // WKT format:
  dataset_name: string;
  license: string | null;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
  value: number;
  unit: string | null;
  sample_pretreatment: string | null;
  technique: string | null;
  laboratory_method: string | null;
  extractant_concentration: string | null;
  extraction_ratio: string | null;
  extraction_base: string | null;
  measurement_procedure: string | null;
  limit_of_detection: string | null;
}

/**
 * Field metadata for export schema
 */
export interface FieldMetadata {
  key: keyof ExportRecord;
  title: string;
  title_truncated: string;
  type: 'string' | 'number';
  gdalType?: 'OFTString' | 'OFTReal';
}

/**
 * Centralized export schema - single source of truth
 * Modify this array to add/remove/reorder fields
 * Important! Title truncated is used for shape files. Can'r exceed 10 chars
 */
export const EXPORT_SCHEMA: FieldMetadata[] = [
  { key: 'geom', title: 'geom', title_truncated: 'geom', type: 'string', gdalType: 'OFTString' },
  { key: 'dataset_name', title: 'dataset_name', title_truncated: 'dataset', type: 'string', gdalType: 'OFTString' },
  { key: 'license', title: 'license', title_truncated: 'license', type: 'string', gdalType: 'OFTString' },
  { key: 'sampling_date', title: 'sampling_date', title_truncated: 'date', type: 'string', gdalType: 'OFTString' },
  { key: 'min_depth', title: 'min_depth', title_truncated: 'min_depth', type: 'number', gdalType: 'OFTReal' },
  { key: 'max_depth', title: 'max_depth', title_truncated: 'max_depth', type: 'number', gdalType: 'OFTReal' },
  { key: 'value', title: 'value', title_truncated: 'value', type: 'number', gdalType: 'OFTReal' },
  { key: 'unit', title: 'unit', title_truncated: 'unit', type: 'string', gdalType: 'OFTString' },
  { key: 'sample_pretreatment', title: 'sample_pretreatment', title_truncated: 'pretreat', type: 'string', gdalType: 'OFTString' },
  { key: 'technique', title: 'technique', title_truncated: 'technique', type: 'string', gdalType: 'OFTString' },
  { key: 'laboratory_method', title: 'laboratory_method', title_truncated: 'lab_method', type: 'string', gdalType: 'OFTString' },
  {
    key: 'extractant_concentration',
    title: 'extractant_concentration',
    title_truncated: 'extrac_con',
    type: 'string',
    gdalType: 'OFTString',
  },
  { key: 'extraction_ratio', title: 'extraction_ratio', title_truncated: 'ratio', type: 'string', gdalType: 'OFTString' },
  { key: 'extraction_base', title: 'extraction_base', title_truncated: 'base', type: 'string', gdalType: 'OFTString' },
  { key: 'measurement_procedure', title: 'measurement_procedure', title_truncated: 'measure', type: 'string', gdalType: 'OFTString' },
  { key: 'limit_of_detection', title: 'limit_of_detection', title_truncated: 'lod', type: 'string', gdalType: 'OFTString' },
];

/**
 * Records grouped by property acronym
 */
export interface GroupedRecords {
  [propertyAcronym: string]: ExportRecord[];
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
    value: sample.value,
    unit: sample.standard_unit,
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
