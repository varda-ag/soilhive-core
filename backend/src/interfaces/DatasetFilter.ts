import { Polygon, MultiPolygon } from 'geojson';
import { GISDataType } from '../types/data';

export interface FilterableMetadata {
  data_types?: GISDataType[]; // Enum
  licenses?: string[]; // slugs
  min_sampling_date?: string | null;
  max_sampling_date?: string | null;
  min_depth?: number | null;
  max_depth?: number | null;
  horizons?: (string | null)[]; // Short strings
  soil_properties?: string[]; // slugs
  raster_filters?: Map<string, number[]>; // Map <table_name, raster_values>
}

export interface DataFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterableMetadata;
}

export interface StoredDataFilter extends DataFilter {
  id: string;
  name: string;
}

export interface FilteredDataset extends FilterableMetadata {
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
