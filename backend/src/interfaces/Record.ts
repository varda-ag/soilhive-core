export interface RawRecord {
  [key: string]: string | number | null;
  geometry: any;
}

export interface SoilRecord {
  record_id: number;
  sampling_date: string | null;
  license: string | null;
  horizon: string | null;
  max_depth: number | null;
  min_depth: number | null;
  user_dropped: boolean;
  [key: string]: string | number | boolean | null;
  geometry: any;
}
