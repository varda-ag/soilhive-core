import { Polygon, MultiPolygon } from 'geojson';

export interface FilterableDatasetMetadata {
  data_types?: string[];
  licenses?: string[];
  min_sampling_date?: string;
  max_sampling_date?: string;
  min_depth?: number;
  max_depth?: number;
  horizons?: string[];
  soil_properties?: string[];
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
  feature_count: number;
}

export interface ResultItem {
  datasets: FilteredDataset[];
}

export interface PostDatasetFilterResponse extends StoredDatasetFilter {
  results: ResultItem[];
}
