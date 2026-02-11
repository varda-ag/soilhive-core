export interface DatasetFileMappingRequest {
  fileID?: string;
  mappingId?: string;
}

export interface DatasetFileMappingResponse extends DatasetFileMappingRequest {
  id: string;
}
