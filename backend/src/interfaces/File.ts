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

export interface FileMetadata {
  field_names: string[];
  detected_fields: Record<DetectableFields, string | null>;
  detected_mapping: DataMappingObject;
  geometry_detected: boolean;
  driver?: string;
  epsg?: number;
  layer_name?: string;
  geom_column?: string;
}

export interface ExtractedFilePath {
  mainFilePath: string;
  tempZipExtractPath: string | null;
}

export interface PatchFileInput {
  epsg?: number;
}
