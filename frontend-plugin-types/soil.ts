export interface PluginSoilProperty {
  id: string;
  property_name: string;
  property_acronym: string;
  description?: string;
  standard_unit?: string;
  property_level?: number;
  parent_property_id?: string;
  category_id: string;
  original_units_of_measurement: Record<string, string>;
}

export interface PluginSoilPropertyCategory {
  id: string;
  slug: string;
  category_name: string;
  category_acronym: string;
  description?: string;
}

export interface PluginRasterFilterCategory {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  active: boolean;
  mappings: Record<string, number> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PluginSoilDataParameters {
  selectedDatasets?: string[];
  availableDatasets: string[];
  filterId?: string;
  limit: number;
  sort?: string;
}

export interface PluginSoilDataSample {
  id: string;
  dataset: string;
  dataset_name: string;
  soil_property: string;
  property_acronym: string;
  standard_unit: string;
  value: number;
  geometry: unknown;
  license_name: string;
  sampling_date: string | null;
  min_depth: number | null;
  max_depth: number | null;
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

export interface PluginSoilDataResult {
  data: PluginSoilDataSample[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
}
