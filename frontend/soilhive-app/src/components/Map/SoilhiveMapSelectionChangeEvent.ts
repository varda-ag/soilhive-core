import { type Polygon, type MultiPolygon } from 'geojson';
export interface SoilhiveMapSelectionChangeEvent {
  zoomLevel: number;
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
  eventType: 'draw' | 'upload' | 'geocoder' | 'bounds' | 'reset';
}
