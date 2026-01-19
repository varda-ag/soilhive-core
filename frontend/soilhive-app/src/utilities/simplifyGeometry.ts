import { coordReduce, simplify, truncate } from '@turf/turf';
import { type MultiPolygon, type Polygon } from 'geojson';

function countCoords(geojson: Polygon | MultiPolygon) {
  return coordReduce(geojson, (sum: number) => sum + 1, 0);
}

export const simplifyGeometry = (geojson: Polygon | MultiPolygon, maxPoints = 10000, options = {}): Polygon | MultiPolygon => {
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

  return truncate(bestResult, {
    precision: 6, // Decimal places (~11.1 centimeters)
    coordinates: 2, // Drop Z if present
    mutate: false,
  });
};
