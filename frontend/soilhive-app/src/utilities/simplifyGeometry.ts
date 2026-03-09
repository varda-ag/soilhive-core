import { coordReduce, simplify, truncate, area } from '@turf/turf';
import { type MultiPolygon, type Polygon } from 'geojson';

function countCoords(geojson: Polygon | MultiPolygon) {
  return coordReduce(geojson, (sum: number) => sum + 1, 0);
}

/**
 * Returns the appropriate WGS84 coordinate decimal precision
 * based on the total area of a geometry (in square meters).
 */
function getPrecisionFromArea(areaSqMeters: number): number {
  const km2 = areaSqMeters / 1_000_000;

  if (km2 > 1_000_000) return 1; // > 1,000,000 km² — country
  if (km2 > 100_000) return 2; // > 100,000 km²     — region
  if (km2 > 10_000) return 3; // > 10,000 km²       — city
  if (km2 > 100) return 4; // > 100 km²
  if (km2 > 0.1) return 5; // > 100,000 m²
  if (km2 > 0.001) return 6; // > 1000 m²
  return 7;
}

export const simplifyGeometry = (geojson: Polygon | MultiPolygon, maxPoints = 5000, options = {}): Polygon | MultiPolygon => {
  if (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon') {
    throw new Error('Input must be Polygon or MultiPolygon geometry');
  }

  const totalPoints = countCoords(geojson);
  if (totalPoints <= maxPoints) return geojson;

  let low = 0;
  let high = 0.01;
  let bestResult = geojson;

  while (high - low > 2e-4) {
    const mid = (low + high) / 2;
    const simplified = simplify(geojson, { ...options, tolerance: mid, mutate: false });
    const points = countCoords(simplified);

    if (points <= maxPoints) {
      bestResult = simplified;
      high = mid;
    } else {
      low = mid;
    }
  }

  const totalArea = area(bestResult);
  const precision = getPrecisionFromArea(totalArea);

  return truncate(bestResult, {
    precision,
    coordinates: 2, // Drop Z if present
    mutate: false,
  });
};
