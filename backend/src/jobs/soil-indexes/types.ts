import type { MultiPolygon, Point, Polygon } from 'geojson';

/**
 * One Scored Geometry, in flight between the methodology that computed it and its `soil_index`
 * row. Shared by every Soil Index Type: what differs between them is how `value` is arrived at,
 * not what a score looks like on the way to storage.
 */
export interface SoilIndexFeature {
  type: 'Feature';
  /** The Aggregation Unit's `unit_id`. */
  id: string;
  /** EPSG:4326. */
  geometry: Point | Polygon | MultiPolygon;
  properties: {
    /** The index value, rounded to 3 decimals as everywhere in this output. */
    value: number;
    /** The year scored; absent when the methodology records none. */
    year?: number;
  };
}
