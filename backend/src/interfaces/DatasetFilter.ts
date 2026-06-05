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
}

export interface DataFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterCriteria;
}

export interface StoredDataFilter {
  id: string;
  filter: DataFilter;
  name?: string;
  owner?: string;
}

export interface FilteredDatasetSummary extends FilterCriteria {
  id: string;
  name: string;
  data_type: GISDataType;
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
}
