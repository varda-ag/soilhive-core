import type { Polygon } from 'geojson';

// TODO: add slug
export interface RasterLayer {
  id: string;
  file_id: string;
  resolution_m: number;
  min_depth: number | null;
  max_depth: number | null;
  reference_period_start: string | null;
  reference_period_stop: string | null;
  dataset_id: string;
  soil_property_id: string;
  description: object | null;
  nodata_value: number | null;
  bbox: Polygon;
  procedure_id?: string | null;
}

//TODO: Add slug
export interface RasterLayerAsset {
  id: string;
  file_id: string;
  raster_layer_id: string;
  description: object | null;
}

export interface RasterLayerMatch {
  id: number;
  file_path: string;
  resolution_m: number;
}
export interface Envelope {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
