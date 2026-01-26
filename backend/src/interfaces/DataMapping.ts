import { PropertyMapping, PropertyCleaningConfig } from './PropertyMapping';

export interface DataMapping {
  id: string;
  data_mapping: DataMappingObject;
  data_mapping_hash: string;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
}

export type DataMappingObject = {
  [key: string]: PropertyMapping | string; // dynamic entries for property columns (PropertyMapping values) and metadata columns (string values)
} & {
  drop_records?: number[] // fixed entries
}

export interface DataCleaningConfig {
  metadata_cols: {
    [key: string]: string;
  };
  property_cols: {
    [key: string]: PropertyCleaningConfig;
  };
  drop_records?: number[];
  file_id: string;
}