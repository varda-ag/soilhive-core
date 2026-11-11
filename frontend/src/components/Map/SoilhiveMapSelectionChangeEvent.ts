import { type Polygon, type MultiPolygon } from 'geojson';

/**
 * How the selected area was picked. `continent` and `country` come from the search box, and `country` stands for
 * any place it finds that is not a continent (a country, a region, a city…). A drawn or uploaded shape is a `drawn-polygon`.
 */
export type SoilhiveMapSelectionType = 'drawn-polygon' | 'h3-cell' | 'country' | 'continent';

export interface SoilhiveMapSelectionChangeEvent {
  bounds: [number, number, number, number];
  geometries?: (Polygon | MultiPolygon)[];
  selectionType: SoilhiveMapSelectionType;
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
