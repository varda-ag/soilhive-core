import { Polygon, MultiPolygon } from 'geojson';
import { GISDataType } from '../types/data';

export interface FilterableDatasetMetadata {
  data_types?: GISDataType[]; // Enum
  licenses?: string[]; // UUIDs
  min_sampling_date?: string;
  max_sampling_date?: string;
  min_depth?: number;
  max_depth?: number;
  horizons?: string[]; // Short strings
  soil_properties?: string[]; // UUIDs
  agroecological_zones?: string[];
  land_cover?: string[];
  soil_groups?: string[];
}

export interface DatasetFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterableDatasetMetadata;
}

export interface StoredDatasetFilter extends DatasetFilter {
  id: string;
  name: string;
}

export interface FilteredDataset extends FilterableDatasetMetadata {
  id: string;
  name: string;
  dataset_layer_count: number;
}

export interface ResultItem {
  datasets: FilteredDataset[];
}

export interface PostDatasetFilterResponse extends StoredDatasetFilter {
  results: ResultItem[];
}
