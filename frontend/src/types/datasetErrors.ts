export interface DatasetErrorItem {
  code: string;
  message: string;
  action: string;
  params: Record<string, unknown>;
  detail?: string;
}

export interface DatasetError {
  dataset_id: string;
  errors: DatasetErrorItem[];
}
