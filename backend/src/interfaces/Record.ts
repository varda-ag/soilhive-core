export interface RawRecord {
  [key: string]: string | number | null;
  geometry: any;
}

export interface SoilRecord {
  sampling_date: string | null;
  license: string | null;
  horizon: string | null;
  max_depth: number | null;
  min_depth: number | null;
  [key: string]: string | number | null;
  geometry: any;
}
