import type { PluginQueryResult } from './common';
import type { PluginAggregationUnit, PluginDataRequestError, PluginDataRequestStatus } from './dataRequest';

// A MapLibre vector source for one Soil Index Run's tiles, ready to spread into
// <Source id="..." {...source}>. Its one source-layer is 'scores' (PluginSoilIndexTileLayer).
export interface PluginVectorTileSource {
  type: 'vector';
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds?: [number, number, number, number]; // [west, south, east, north]; absent when the Run scored nothing
}

export type PluginSoilIndexTileLayer = 'scores';

// Properties of a feature in the 'scores' layer. Zoomed in, a feature is one score, and its
// feature id is the score's id. Zoomed out, it is a point summarising one year's scores in one grid
// cell, at their centroid: value is their mean, and count, min and max are present only on cells.
// An absent attribute has no value.
export interface PluginSoilIndexTileFeature {
  value: number;
  year?: number;
  count?: number;
  min?: number;
  max?: number;
}

// One score, as read on hover. metadata is the methodology's own, for the plugin to format.
export interface PluginSoilIndexScore {
  id: number;
  value: number;
  year?: number;
  metadata: Record<string, unknown>;
}

// ---- Soil Index Runs (POST/GET/DELETE /soil-indexes) ----

export interface PluginSoilIndexSubmission {
  soil_index_type: 'crea-index'; // currently a mock: 50,000 points with values from 0 to 1, years 2015–2024
  filter_id: string; // supplies the aggregation areas, unless file_id is given
  file_id?: string;
  label_field?: string; // requires file_id
}

// What was asked, plus the aggregation areas it resolved to.
export type PluginSoilIndexRunParameters = PluginSoilIndexSubmission & {
  config_id?: string; // the config item the Run is attached to
  derived_filter_id: string | null;
  unit_count: number;
  units: PluginAggregationUnit[];
};

export interface PluginSoilIndexRun {
  id: string; // store it to show the Run's tiles, and delete it once unused
  status: PluginDataRequestStatus;
  created_at: string;
  completed_at: string | null; // null while pending or running
  progress_percentage?: number;
  progress_description?: string;
  message: string | null; // why it failed; null unless status is 'failed'
  request: PluginSoilIndexRunParameters;
  data?: {
    score_count: number;
    bounds?: [number, number, number, number]; // [west, south, east, north]; absent when nothing was scored
    tiles: string; // the Run's TileJSON path; useSoilIndexTileSource(id) turns it into a map source
  };
}

// The same error kinds as a Data Request: 'forbidden' means no read on the Run's config item.
export interface PluginSoilIndexRunResult extends PluginQueryResult<PluginSoilIndexRun> {
  error: PluginDataRequestError | undefined; // on 'lost' and 'forbidden', data is undefined
}
