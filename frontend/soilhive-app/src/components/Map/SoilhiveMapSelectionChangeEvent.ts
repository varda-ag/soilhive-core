import { type Polygon, type MultiPolygon } from 'geojson';
export interface SoilhiveMapSelectionChangeEvent {
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
}
