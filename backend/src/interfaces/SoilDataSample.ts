import { GISDataType } from '../types/data';

export interface SoilDataSample {
  id: string;
  dataset_id: string;
  dataset_name: string;
  gis_datatype: GISDataType;
  soil_property: string;
  property_acronym: string;
  property_name: string;
  standard_unit: string | null;
  value: number;
  /** Class label of `value` when the property is categorical (soil_properties.classes), else null. */
  value_label: string | null;
  geometry: any;
  license_name: string | null;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
  // Raster rows only: the Raster Layer's pixel size in metres. Null on vector rows.
  resolution_m: number | null;
  // Raster rows only: the Raster Layer's reference period, as YYYY, YYYY-MM or YYYY-MM-DD. Null on vector rows.
  reference_period_start: string | null;
  reference_period_stop: string | null;
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
