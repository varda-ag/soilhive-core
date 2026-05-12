import { coordReduce, area, feature } from '@turf/turf';
import { type Feature, type MultiPolygon, type Polygon, type Position } from 'geojson';

export const countCoords = (geojson: Polygon | MultiPolygon) => {
  return coordReduce(geojson, (sum: number) => sum + 1, 0);
};

/**
 * Returns the appropriate WGS84 coordinate decimal precision
 * based on the total area of a geometry (in square meters).
 */
export const getPrecisionFromArea = (areaSqMeters: number): number => {
  const km2 = areaSqMeters / 1_000_000;
  if (km2 > 100_000) return 2; // > 100,000 km²     — region
  if (km2 > 10_000) return 3; // > 10,000 km²       — city
  if (km2 > 100) return 4; // > 100 km²
  if (km2 > 0.1) return 5; // > 100,000 m²
  if (km2 > 0.001) return 6; // > 1000 m²
  return 7;
};

export const removeCollapsedPolygons = (feature: Feature) => {
  if (feature.geometry.type === 'Polygon') {
    // Convert to MultiPolygon logic for uniform handling
    const validRings = feature.geometry.coordinates.filter(ring => ring.length >= 4);
    if (validRings.length === 0) return null; // entire polygon collapsed
    return {
      ...feature,
      geometry: { ...feature.geometry, coordinates: validRings },
    };
  }

  if (feature.geometry.type === 'MultiPolygon') {
    const validPolygons = feature.geometry.coordinates
      // Each polygon is an array of rings; keep only polygons where the outer ring is valid
      .map(polygon => polygon.filter(ring => ring.length >= 4))
      .filter(polygon => polygon.length > 0); // drop polygons with no valid outer ring

    if (validPolygons.length === 0) return null; // entire multipolygon collapsed
    return {
      ...feature,
      geometry: { ...feature.geometry, coordinates: validPolygons },
    };
  }

  return feature;
};

export const removeZeroAreaPolygons = (input: Feature) => {
  if (input.geometry.type !== 'MultiPolygon') return input;

  const validPolygons = input.geometry.coordinates.filter(polygonCoords => {
    const tempFeature = feature({ type: 'Polygon', coordinates: polygonCoords });
    return area(tempFeature) > 0; // drop if collapsed to a line/point
  });

  if (validPolygons.length === 0) return null;
  return {
    ...input,
    geometry: { ...input.geometry, coordinates: validPolygons },
  };
};

export const removeDuplicateCoords = (coords: Position[]) => {
  return coords.filter((coord, i) => {
    if (i === 0) return true;
    const prev = coords[i - 1];
    return coord[0] !== prev[0] || coord[1] !== prev[1];
  });
};

export const deduplicateGeometry = (feature: Feature) => {
  const type = feature.geometry.type;

  const processRing = (ring: Position[]) => {
    const deduped = removeDuplicateCoords(ring);
    // Re-close the ring if the closing point was removed
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      deduped.push([...first]);
    }
    return deduped;
  };

  if (type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map(processRing),
      },
    };
  }

  if (type === 'MultiPolygon') {
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: feature.geometry.coordinates.map(polygon => polygon.map(processRing)),
      },
    };
  }

  return feature;
};

export const removeSmallPolygons = (input: Feature, minAreaM2: number) => {
  if (input.geometry.type !== 'MultiPolygon') return input;

  const validPolygons = input.geometry.coordinates.filter(polygonCoords => {
    const tempFeature = feature({ type: 'Polygon', coordinates: polygonCoords });
    return area(tempFeature) >= minAreaM2;
  });

  if (validPolygons.length === 0) return null;

  // Downgrade to Polygon if only one polygon remains
  if (validPolygons.length === 1) {
    return feature(
      {
        type: 'Polygon',
        coordinates: validPolygons[0],
      },
      input.properties,
    );
  }

  return feature(
    {
      type: 'MultiPolygon',
      coordinates: validPolygons,
    },
    input.properties,
  );
};
