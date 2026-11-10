import { type Polygon, type MultiPolygon } from 'geojson';

export interface SoilhiveMapSelectionChangeEvent {
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
  selectionType: 'drawn-polygon' | 'h3-cell' | 'country';
  locationName?: string;
}

/**
 * How the visitor picked an area: a place found with the search box, a polygon drawn or uploaded,
 * or an H3 cell clicked. `placeType` is the search result's kind as the geocoder gives it (e.g.
 * `country`, `city`, `continent`) and `placeName` its name.
 */
export interface SoilhiveMapLocationSearchEvent {
  method: 'search' | 'draw' | 'upload' | 'cell';
  placeType?: string;
  placeName?: string;
}
