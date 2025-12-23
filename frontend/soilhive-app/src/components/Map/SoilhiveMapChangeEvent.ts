import { type Polygon, type MultiPolygon } from 'geojson';
export interface SoilhiveMapChangeEvent {
  bounds: [number, number, number, number];
  zoomLevel: number;
  geometry?: Polygon | MultiPolygon;
  h3CellId?: string;
  eventType: 'bounds' | 'draw' | 'upload' | 'cellClick';
}
