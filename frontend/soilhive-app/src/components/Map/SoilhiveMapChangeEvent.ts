import { type Polygon, type MultiPolygon } from 'geojson';
export interface SoilhiveMapChangeEvent {
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
}
