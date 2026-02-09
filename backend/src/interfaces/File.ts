import type { IngestionStatus } from '../types/data';
import { DetectableFields } from '../types/DataMapping';

export interface File {
  id: string;
  slug?: string;
  file_path?: string;
  status?: IngestionStatus;
  // metadata?: FileMetadata;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
}

export interface FileMetadata {
  field_names: string[];
  detected_fields: Record<DetectableFields, string | null>;
  geometry_detected: boolean;
}

export interface ExtractedFilePath {
  mainFilePath: string;
  tempZipExtractPath: string | null;
}
