import type { IngestionStatus, ProcedureField } from '../types/data';
import { DataMappingObject, DetectableFields } from '../types/DataMapping';
import type { Envelope } from '../utils/GdalCLI';
import type { LongFormatStats } from './CleaningReport';

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
  category_labels?: Record<string, string>; // { pixel value: label }, from the band's attribute table or category names
}

/** Four [x, y] corners: upper-left, upper-right, lower-right, lower-left. */
export type Georeference = [[number, number], [number, number], [number, number], [number, number]];

/** Where `epsg` came from: the file itself, or the data admin. */
export type CrsSource = 'inferred' | 'supplied';

interface GeoreferenceMetadata {
  crs_source?: CrsSource; // Absent on files that predate it: read as 'inferred'
  georeference?: Georeference | null; // In the file's own CRS. null: none found; absent: never extracted
  georeference_wgs84?: Georeference; // Absent while the CRS is unknown, or when a corner does not reproject. Longitudes go past ±180° for a file crossing the antimeridian
}

export interface RasterFileMetadata extends GeoreferenceMetadata {
  is_raster: true;
  driver?: string;
  epsg?: number;
  wkt?: string;
  bbox_wgs84?: Envelope; // Its Bounding box, recorded by the Raster Load only when its Raster Layers are stored as the whole band of longitude
  size: [number, number]; // [width, height] in pixels
  band_count: number;
  raster_bands: RasterBandMetadata[];
  unit_conversion_applied?: boolean; // Avoids re-applying the unit-conversion factor on top of already-scaled pixels on load retry.
  source_file_path?: string; // The upload as it was before normalization repointed file_path; what a re-normalization starts from.
}

/** Wide: one column per property. Long: one row per measured value (docs/adr/0081). */
export type VectorFormat = 'wide' | 'long';

/** The columns of a long File, by the role each plays. */
export interface LongRoles {
  property_col: string | null; // null: the File names no property, so the user sets one for the whole File
  value_col: string | null;
  unit_col: string | null;
  method_code_col: string | null;
  procedure_cols: Partial<Record<ProcedureField, string>>;
}

export interface VectorFileMetadata extends GeoreferenceMetadata {
  is_raster: false;
  field_names: string[];
  detected_fields: Record<DetectableFields, string | null>;
  detected_mapping: DataMappingObject;
  detected_format?: VectorFormat; // Suggested from a sample of rows. Absent on files that predate it: read as 'wide'
  detected_long_roles?: LongRoles; // Only when detected_format is 'long'
  long_format_stats?: LongFormatStats; // Written by file-to-db when it pivots a long File; removed when it stages the File as wide
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
