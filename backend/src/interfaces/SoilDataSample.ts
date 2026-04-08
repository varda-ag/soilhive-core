export interface SoilDataSample {
  id: string;
  dataset_id: string;
  dataset_name: string;
  soil_property: string;
  property_acronym: string;
  property_name: string;
  standard_unit: string | null;
  value: number;
  geometry: any;
  license_name: string | null;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
  // TODO: to be restored | horizon: string | null;
  sample_pretreatment: string | null;
  technique: string | null;
  laboratory_method: string | null;
  extractant_concentration: string | null;
  extraction_ratio: string | null;
  extraction_base: string | null;
  measurement_procedure: string | null;
  limit_of_detection: string | null;
  cursor: string;
}
