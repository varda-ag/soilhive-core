import type { Polygon, MultiPolygon } from 'geojson';
import { Extent } from '../types/data';

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
  extent_type: Extent;
  bbox: Polygon | null;
  footprint: MultiPolygon | null;
  description: object | null;
  geohash_cells: string[] | null;
  nodata_value: number | null;
}

// TODO: add slug
export interface RasterLayerAsset {
  id: string;
  file_id: string;
  raster_layer_id: string;
  description: object | null;
}

export interface FootprintGeohashIntersectEntry {
  id: number;
  file_path: string;
  resolution_m: number;
  extent_type: Extent;
}

export interface QueryResult {
  file_path: string;
  has_data: boolean;
}

export interface PixelWindow {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Envelope {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface IngestInput {
  filePath: string;
  resolutionM: number;
  extentType: Extent;
  nodataValue?: number;
}

export interface IngestResult {
  id: number;
  file_path: string;
  resolution_m: number;
  extent_type: Extent;
}
