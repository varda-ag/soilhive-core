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
