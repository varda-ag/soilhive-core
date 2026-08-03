import type { PluginGeometry } from './map';

export type PluginGISDataType = 'point' | 'polygonal' | 'raster';

export interface PluginFilterCriteria {
  data_types?: PluginGISDataType[];
  licenses?: string[];
  min_sampling_date?: string;
  max_sampling_date?: string;
  min_depth?: number;
  max_depth?: number;
  horizons?: string[];
  soil_properties?: string[];
  raster_filters?: Record<string, number[]>;
  visibility?: 'public' | 'private';
}

export interface PluginDataFilterInput {
  geometries: PluginGeometry[];
  parameters: PluginFilterCriteria;
}

export interface PluginFilteredDatasetSummary extends PluginFilterCriteria {
  id: string;
  name: string;
  data_type: PluginGISDataType;
  visibility: 'public' | 'private';
  dataset_layer_count: number;
  raster_layer_count: number;
}

export interface PluginFilteredData {
  datasets: PluginFilteredDatasetSummary[];
  raster_filters: Record<string, number[]>;
}
