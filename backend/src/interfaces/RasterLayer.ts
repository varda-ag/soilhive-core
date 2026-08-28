import type { Polygon } from 'geojson';

export interface RasterLayer {
  id: string;
  file_id: string;
  band: number;
  resolution_m: number;
  min_depth: number | null;
  max_depth: number | null;
  reference_period_start: string | null;
  reference_period_stop: string | null;
  dataset_id: string;
  soil_property_id: string;
  is_categorical: boolean;
  description: object | null;
  nodata_value: number | null;
  bbox: Polygon;
  procedure_id?: string | null;
}

export interface RasterLayerAsset {
  id: string;
  file_id: string;
  raster_layer_id: string;
  description: object | null;
}

// A Raster Layer Asset joined with the File it points to — the shape the raster export
// job needs to write the asset under its layer's subfolder (name for the on-disk filename,
// file_path for the storage read).
export interface RasterLayerAssetFile {
  raster_layer_id: string;
  file_id: string;
  name: string;
  file_path: string;
}

export interface Envelope {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
