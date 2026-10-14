import type { IngestionStatus } from '../types/data';
import { DataMappingObject, DetectableFields } from '../types/DataMapping';

export interface File {
  id: string;
  slug: string;
  name: string;
  file_path: string;
  status?: IngestionStatus;
  metadata?: FileMetadata;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
}

export interface RasterBandMetadata {
  band_number: number;
  data_type: string;
  min_value?: number;
  max_value?: number;
  no_data_value?: number;
  overviews?: Array<[number, number]>; // [width, height] in pixels
}

export interface RasterFileMetadata {
  is_raster: true;
  driver?: string;
  epsg?: number;
  wkt?: string;
  extent?: [number, number, number, number]; // If empty the raster is not georeferenced
  size: [number, number]; // [width, height] in pixels
  band_count: number;
  raster_bands: RasterBandMetadata[];
  unit_conversion_applied?: boolean; // Avoids re-applying the unit-conversion factor on top of already-scaled pixels on load retry.
  source_file_path?: string; // The upload as it was before normalization repointed file_path; what a re-normalization starts from.
  loaded_bands?: Record<string, LoadedRasterBand>; // What the last successful Raster Load ingested, keyed by band number.
}

/**
 * The parts of one band's resolved mapping that decide how the file's pixels were written. A change
 * to any of them cannot be applied to the existing layer in place: the file has to be normalized
 * again from its source. Everything else a band mapping declares is plain layer metadata.
 */
export interface LoadedRasterBand {
  standardUnit: string | null;
  originalUnit: string | null;
  conversionFormula: string | null;
  isCategorical: boolean;
}

export interface VectorFileMetadata {
  is_raster: false;
  field_names: string[];
  detected_fields: Record<DetectableFields, string | null>;
  detected_mapping: DataMappingObject;
  geometry_detected: boolean;
  driver?: string;
  epsg?: number;
  wkt?: string;
  layer_name?: string;
  geom_column?: string;
}

export type FileMetadata = RasterFileMetadata | VectorFileMetadata;

export interface ExtractedFilePath {
  mainFilePath: string;
  tempZipExtractPath: string | null;
}

export interface PatchFileInput {
  epsg?: number;
}
