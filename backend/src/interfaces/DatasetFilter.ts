import { Polygon, MultiPolygon } from 'geojson';
import { GISDataType } from '../types/data';

export interface FilterCriteria {
  data_types?: GISDataType[]; // Enum
  licenses?: string[]; // slugs
  min_sampling_date?: string | null;
  max_sampling_date?: string | null;
  min_depth?: number | null;
  max_depth?: number | null;
  horizons?: (string | null)[]; // Short strings
  soil_properties?: string[]; // slugs
  raster_filters?: Record<string, number[]>; // Map <table_name, raster_values>
  visibility?: 'public' | 'private';
}

export interface DataFilterDTO {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterCriteria;
}

export interface DataFilter {
  geometryIds: string[];
  parameters: FilterCriteria;
  area: number; // Total area covered by the geometries in m2
}

export interface StoredDataFilter {
  id: string;
  filter: DataFilterDTO;
  name?: string;
  owner?: string;
}

export interface FilteredDatasetSummary extends FilterCriteria {
  id: string;
  name: string;
  data_type: GISDataType;
  visibility: 'public' | 'private';
  dataset_layer_count?: number;
  raster_layer_count?: number;
}

export interface FilteredData {
  datasets: FilteredDatasetSummary[];
  raster_filters: Record<string, number[]>;
}

export interface FilteredDataset {
  id: string;
  name: string;
  data_type: GISDataType;
  visibility: 'public' | 'private';
}

export interface FilteredRasterLayer {
  id: string;
  dataset_name: string;
  path: string;
  min_depth: number | null;
  max_depth: number | null;
  reference_period_start: string | null;
  reference_period_stop: string | null;
  soil_property_name: string;
  standard_unit: string | null;
  laboratory_method: string | null;
}
