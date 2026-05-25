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
  raster_filters?: Record<string, number[]>; // server side is Map <table_name, raster_values>, but on FE this can lead to React equality checks errors
}

export interface DataFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterCriteria;
}

export interface StoredDataFilter extends DataFilter {
  id: string;
  name: string;
}

export interface FilteredDatasetSummary extends FilterCriteria {
  id: string;
  name: string;
  data_type: GISDataType;
  dataset_layer_count: number;
  raster_layer_count: number;
}

export interface FilteredData {
  datasets: FilteredDatasetSummary[];
  raster_filters: Record<string, number[]>;
}

export interface FilteredDataset {
  id: string;
  name: string;
  data_type: GISDataType;
}

export interface ResultItem {
  datasets: FilteredDatasetSummary[];
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
  original_units_of_measurement: Record<string, string>;
}

export interface SoilPropertyCategory {
  id: string;
  slug: string;
  category_name: string;
  category_acronym: string;
  description?: string;
}

export interface MeasuredProperty {
  soil_property_id: string;
  procedure_id: string;
}

export const enum GISDataType {
  POINT = 'point',
  POLYGONAL = 'polygonal',
  RASTER = 'raster',
}

export const enum IngestionStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  STAGED = 'STAGED',
  LOADED = 'LOADED',
  PUBLISHED = 'PUBLISHED',
}

export enum Capability {
  PREVIEW = 'preview',
  DOWNLOAD = 'download',
  OBFUSCATE_AS_POINTS = 'obfuscate_as_points',
  OBFUSCATE_AS_POLYGONS = 'obfuscate_as_polygons',
}

export interface Dataset {
  id: string;
  slug: string;
  name: string;
  full_name?: string | null;
  version?: string | null;
  author?: string | null;
  description?: string | null;
  data_producer?: string | null;
  measured_properties?: MeasuredProperty[] | null;
  spatial_resolution?: string | null;
  publication_date?: string | null;
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
  licenses?: string[] | null;
  citation?: string | null;
  geographical_extent?: string | null;
  gis_datatype?: GISDataType | null;
  spatial_extent: Polygon | null;
  n_observations?: string | null;
  n_raster_layers?: number | null;
  soil_depth?: object | null;
  status: IngestionStatus;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string | null;
  service_location?: string | null;
  capabilities?: Capability[];
  visibility: 'public' | 'private';
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
  mappings: Record<string, number> | null; // e.g., { "Artic": 1 }
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface License {
  id: string;
  name: string;
  slug?: string;
  full_name?: string;
  url?: string;
  created_at: Date;
  updated_at: Date | null;
}

export interface GeneralInfoFormData {
  name: string;
  full_name: string;
  description: string;
  author: string;
}

export interface PropertyMapping {
  property_id: string;
  conversion_id?: string;
  min_val?: number;
  max_val?: number;
  procedure_id?: string;
}

export interface DataMappingObject {
  [columnName: string]: string | PropertyMapping;
}

export type DataMappingRequest = DataMappingObject;

export interface DataMappingResponse {
  id: string;
  data_mapping: DataMappingObject;
}

export interface DatasetFileMappingRequest {
  fileID?: string;
  mappingId?: string;
}

export interface DatasetFileMappingResponse {
  id: string;
  fileID: string;
  mappingId: string;
}

export interface ProcedurePayload {
  sample_pretreatment?: string;
  technique?: string;
  laboratory_method?: string;
  extractant_concentration?: string;
  extraction_ratio?: string;
  extraction_base?: string;
  measurement_procedure?: string;
  limit_of_detection?: string;
}

export interface ProcedureResponse extends ProcedurePayload {
  id: string;
}

export interface VocabularyItem {
  id: string;
  category: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type EntitlementCapability = 'preview' | 'download' | 'obfuscate_as_points' | 'obfuscate_as_polygons';
export type DatasetEntitlements = Record<string, EntitlementCapability[]>;

export interface FileDescriptor {
  // required
  id: string;
  name: string;
  created_at: string;
  created_by: string;

  // optional
  file_path?: string;
  status?: string;
  metadata?: {
    detected_fields?: {
      geometry?: string | null;
      latitude?: string | null;
      longitude?: string | null;
      sampling_date?: string | null;
      license?: string | null;
      depth?: string | null;
      min_depth?: string | null;
      max_depth?: string | null;
      horizon?: string | null;
    };
    detected_mapping: DataMappingObject;
    field_names?: string[];
    geometry_detected?: boolean;
    driver?: string | null;
    epsg?: number | null;
    [key: string]: unknown; // additionalProperties: true
  };
  is_archived?: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface DataAvailabilityIndex {
  resolution: number;
  min: number;
  max: number;
  cells: Record<string, number>;
}
