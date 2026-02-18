import { type Polygon, type MultiPolygon } from 'geojson';

export interface SoilhiveMapSelectionChangeEvent {
  zoomLevel: number;
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
  selectionType: 'drawn-polygon' | 'h3-cell' | 'country';
  locationName?: string;
}
