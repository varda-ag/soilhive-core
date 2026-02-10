export interface DatasetFileMapping {
  id: string;
  dataset_id: string;
  file_id?: string;
  data_mapping_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DatasetFileMappingRequest {
  fileID?: string;
  mappingId?: string;
}

export interface DatasetFileMappingResponse {
  id: string;
}
