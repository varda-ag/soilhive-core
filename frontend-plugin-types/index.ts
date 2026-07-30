export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

export interface PluginDataset {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface PluginLngLat {
  lng: number;
  lat: number;
}

export interface PluginGeoJSONFeature {
  type: 'Feature';
  geometry: unknown;
  properties: Record<string, unknown> | null;
}

export type PluginGeometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };

export interface PluginMapSelection {
  selectedPoint: PluginLngLat | null;
  selectedH3Cell: PluginGeoJSONFeature | null;
  selection: { type: string; features: PluginGeoJSONFeature[] };
  boundingBox: [number, number, number, number];
  geometryFilter: PluginGeometry[];
  selectionType: 'h3-cell' | 'drawn-polygon' | 'country';
  locationName?: string;
}

export interface PluginTheme {
  colors: Record<string, string>;
  logoUrl: string | null;
}

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

export interface PluginContext {
  user?: PluginUser | null;
  useDatasets: () => PluginQueryResult<PluginDataset[]>;
  mapSelection?: PluginMapSelection;
  useTheme: () => PluginQueryResult<PluginTheme>;
  useDataFilterQuery: (filters: PluginDataFilterInput, enabled?: boolean, debounceTime?: number) => PluginQueryResult<string>;
}
