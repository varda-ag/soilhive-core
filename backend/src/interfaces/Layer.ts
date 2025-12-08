export interface Layer {
  id: string;
  license?: string;
  sampling_date?: Date;
  min_depth?: number;
  max_depth?: number;
  horizon?: string;
}
