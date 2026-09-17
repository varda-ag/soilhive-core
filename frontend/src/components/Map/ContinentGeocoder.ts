import { bbox as bboxFn, centerOfMass } from '@turf/turf';
import type { CarmenGeojsonFeature } from '@maplibre/maplibre-gl-geocoder';
// Continent boundaries dissolved/simplified from Natural Earth's 110m Admin-0
// Countries dataset (public domain): https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
import continents from 'assets/data/continents.json';

export const continentNameMatches = (name: string, query: string): boolean => {
  const lower = name.toLowerCase();
  // Matches the full name ("north am" -> "North America") or any individual
  // word in it ("america" -> both "North America" and "South America").
  return lower.startsWith(query) || lower.split(' ').some(word => word.startsWith(query));
};

// Nominatim doesn't index continents at all, so we supplement it with a small
// bundled boundary dataset via maplibre-gl-geocoder's `localGeocoder` hook.
// Local results are merged with the Nominatim results and flow through the
// exact same rendering/selection pipeline, so no CarmenGeojsonFeature field
// can be left out here - the shape mirrors nominatimGeocoderAPI's in GeocoderControl.tsx.
export const continentLocalGeocoder = (query: string): CarmenGeojsonFeature[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return continents.features
    .filter(feature => continentNameMatches(feature.properties.name, q))
    .map(
      feature =>
        ({
          type: 'Feature',
          id: `continent.${feature.properties.name}`,
          bbox: bboxFn(feature as GeoJSON.Feature),
          geometry: {
            type: 'Point',
            coordinates: centerOfMass(feature as GeoJSON.Feature).geometry.coordinates,
          } as GeoJSON.Point,
          original_feature: feature,
          original_geometry: feature.geometry,
          place_name: feature.properties.name,
          properties: feature.properties,
          text: feature.properties.name,
          place_type: ['place'],
        }) as CarmenGeojsonFeature,
    );
};

export const isContinentResult = (feature: CarmenGeojsonFeature): boolean =>
  typeof feature.id === 'string' && feature.id.startsWith('continent.');

// When a continent local result is present (e.g. searching "Africa"), Nominatim
// often also returns its own point-only entry for the same name - drop that
// duplicate so only our polygon-backed continent result shows up.
export const filterDuplicateContinentPoints = (
  feature: CarmenGeojsonFeature,
  _index?: number,
  allResults?: CarmenGeojsonFeature[],
): boolean => {
  if (isContinentResult(feature) || !allResults) return true;
  const isPoint = (feature as any).original_geometry?.type === 'Point';
  if (!isPoint) return true;
  const hasMatchingContinentResult = allResults.some(
    other => isContinentResult(other) && other.place_name?.toLowerCase() === feature.place_name?.toLowerCase(),
  );
  return !hasMatchingContinentResult;
};
