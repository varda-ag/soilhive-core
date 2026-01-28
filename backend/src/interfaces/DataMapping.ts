import { PropertyCleaningConfig } from './PropertyMapping';
import type { DataMappingObject } from '../types/DataMapping';

export interface DataMapping {
  id: string;
  data_mapping: DataMappingObject;
  data_mapping_hash: string;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
}

export interface DataCleaningConfig {
  metadata_cols: {
    [key: string]: string | null;
  };
  property_cols: {
    [key: string]: PropertyCleaningConfig;
  };
  drop_records?: number[];
  file_id: string;
}
