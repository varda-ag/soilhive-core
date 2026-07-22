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
  extent?: [number, number, number, number]; // If empty the raster is not georeferenced
  size: [number, number]; // [width, height] in pixels
  band_count: number;
  raster_bands: RasterBandMetadata[];
}

export interface VectorFileMetadata {
  is_raster: false;
  field_names: string[];
  detected_fields: Record<DetectableFields, string | null>;
  detected_mapping: DataMappingObject;
  geometry_detected: boolean;
  driver?: string;
  epsg?: number;
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
