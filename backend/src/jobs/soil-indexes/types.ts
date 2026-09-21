/**
 * One Aggregation Unit's score, in flight between the methodology that computed it and its
 * `soil_index` row. Shared by every Soil Index Type: what differs between them is how `value` is
 * arrived at, not what a scored unit looks like on the way to storage.
 */
export interface SoilIndexFeature {
  type: 'Feature';
  /** The Aggregation Unit's `unit_id`. */
  id: string;
  geometry: {
    type: 'Point';
    /** [longitude, latitude] in EPSG:4326. */
    coordinates: [number, number];
  };
  properties: {
    /** The index value, rounded to 3 decimals as everywhere in this output. */
    value: number;
  };
}
