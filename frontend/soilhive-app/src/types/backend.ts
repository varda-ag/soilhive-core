import { type Polygon, type MultiPolygon } from 'geojson';

// THE FOLLOWING DEFINITIONS FOR StoredDataFilter ARE TAKEN STRAIGHT OUT OF THE BACKEND
export interface BackendFilterCriteria {
  data_types?: GISDataType[];
  licenses?: string[];
  min_sampling_date?: string | null;
  max_sampling_date?: string | null;
  min_depth?: number | null;
  max_depth?: number | null;
  horizons?: (string | null)[];
  soil_properties?: string[];
  raster_filters?: Map<string, number[]>;
}

export interface BackendDataFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterCriteria;
}

export interface BackendStoredDataFilter {
  id: string;
  filter: DataFilter;
  name?: string;
  owner?: string;
}

// THE FOLLOWING DEFINITIONS DO NOT CORRESPOND TO THE BACKEND ONES
export interface FilterCriteria {
  data_type?: string;
  licenses?: string[];
  min_sampling_date?: string;
  max_sampling_date?: string;
  min_depth?: number;
  max_depth?: number;
  horizons?: string[];
  soil_properties?: string[];
  raster_filters?: Map<string, number[]>; // Map <table_name, raster_values>
}

export interface DataFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterCriteria;
}

export interface StoredDataFilter extends DataFilter {
  id: string;
  name: string;
}

export interface FilteredDataset extends FilterCriteria {
  id: string;
  name: string;
  dataset_layer_count: number;
}

export interface ResultItem {
  datasets: FilteredDataset[];
}

export interface PostDatasetFilterResponse extends StoredDataFilter {
  results: ResultItem[];
}

export interface SoilProperty {
  id: string;
  property_name: string;
  property_acronym: string;
  description?: string;
  standard_unit?: string;
  property_level?: number;
  parent_property_id?: string;
  category_id: string;
}

export interface SoilPropertyCategory {
  id: string;
  slug: string;
  category_name: string;
  category_acronym: string;
  description?: string;
}

export interface VariableMeasured {
  description: string;
  soil_parameter: string;
  sample_pretreatment?: string;
  technique?: string;
  extractant_concentration?: string;
  extraction_ratio?: string;
  extraction_base?: string;
  instrument?: string;
  limit_of_detection?: string;
  soil_parameter_code: string;
  unit_of_measurement: string;
}

export const enum GISDataType {
  POINT = 'point',
  POLYGONAL = 'polygonal',
  RASTER = 'raster',
}

export const enum IngestionStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  INGESTED = 'INGESTED',
  RELEASED = 'RELEASED',
  ARCHIVED = 'ARCHIVED',
}
export interface Dataset {
  id: string;
  name: string;
  full_name?: string;
  version?: string;
  author?: string;
  description?: string;
  data_producer?: string;
  variables_measured?: VariableMeasured[];
  spatial_resolution?: string;
  publication_date?: string;
  reference_period_start?: string;
  reference_period_stop?: string;
  licenses?: string[];
  citation?: string;
  geographical_extent?: string;
  gis_datatype?: GISDataType;
  spatial_extent: Polygon;
  n_observations?: string;
  n_raster_layers?: number;
  soil_depth?: object;
  status: IngestionStatus;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
  service_location?: string;
}

export interface SoilDataParameters {
  selectedDatasets?: string[];
  availableDatasets: string[];
  filterId?: string;
  filters?: { soil_properties: string[] | undefined };
  limit: number;
  cursor?: string;
  sort?: string;
}

export interface SoilDataSample {
  id: string;
  dataset: string;
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

export interface RasterFilterCategory {
  id: string; // e.g., 'land_cover'
  name: string; // e.g. Land Cover
  description: string;
  enabled: boolean;
  mapping: Record<string, number>; // e.g., { "Artic": 1 }
}
