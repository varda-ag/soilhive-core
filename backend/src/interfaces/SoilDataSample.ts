export interface SoilDataSample {
  id: string;
  dataset_id: string;
  dataset_name: string;
  soil_property: string;
  property_acronym: string;
  standard_unit: string;
  value: number;
  geometry: any;
  license_name: string;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
  horizon: string | null;
  sample_pretreatment: string | null;
  technique: string | null;
  extractant_formulation: string | null;
  extractant_concentration: string | null;
  extraction_ratio: string | null;
  extraction_base: string | null;
  instrument: string | null;
  limit_of_detection: string | null;
  cursor: string;
}
