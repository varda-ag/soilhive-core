import { simplify, truncate, area } from '@turf/turf';
import { type MultiPolygon, type Polygon } from 'geojson';
import { countCoords, getPrecisionFromArea } from './geometry';

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
