import { MultiPolygon, Polygon } from "geojson";

export interface FilterableDatasetMetadata {
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

export interface DatasetFilter extends FilterableDatasetMetadata {
  geometry: Polygon | MultiPolygon;
}

export interface FilteredDataset extends FilterableDatasetMetadata {
  id: string;
  feature_count: number;
  data_type: string;
}

export interface PostDatasetFilterResponse {
  id: string;
  name: string;
  filter: DatasetFilter;
  datasets: FilteredDataset[];
}

