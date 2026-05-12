import { area, bboxPolygon, booleanPointInPolygon, featureCollection, polygon } from '@turf/turf';
import { featureToH3Set } from 'geojson2h3';
import { cellToBoundary, cellToLatLng, type CoordPair, type H3Index } from 'h3-js';
import { lerp } from 'math.gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { DataAvailabilityIndex } from '../types/backend';

export function h3IndexesToGeoJSONPolygon(h3Index: H3Index) {
  const [lat, lng] = cellToLatLng(h3Index);
  const vertices = cellToBoundary(h3Index, true);
  const actualCount = vertices.length;
  const factor = 1;

  // normalize with respect to center
  normalizeLongitudes(vertices, lng);

  // `cellToBoundary` returns same array object for first and last vertex (closed polygon),
  // if so skip scaling the last vertex
  const vertexCount = vertices[0] === vertices[actualCount - 1] ? actualCount - 1 : actualCount;
  for (let i = 0; i < vertexCount; i++) {
    vertices[i][0] = lerp(lng, vertices[i][0], factor);
    vertices[i][1] = lerp(lat, vertices[i][1], factor);
  }

  return {
    type: 'Feature',
    properties: { h3Index },
    geometry: {
      type: 'Polygon',
      coordinates: [vertices],
    },
  };
}

function normalizeLongitudes(vertices: CoordPair[], refLng: number) {
  for (const pt of vertices) {
    const deltaLng = pt[0] - (refLng === undefined ? vertices[0][0] : refLng);
    if (deltaLng > 180) {
      pt[0] -= 360;
    } else if (deltaLng < -180) {
      pt[0] += 360;
    }
  }
}

export function h3IndexesToGeoJSONPolygons(h3Indexes: Array<H3Index>): FeatureCollection {
  return featureCollection(h3Indexes.map(h3IndexesToGeoJSONPolygon) as any);
}

export function dataAvailabilityIndexToGeoJSONPolygons(dai: DataAvailabilityIndex): FeatureCollection {
  const features = Object.entries(dai.cells).map(([h3Index, daiValue]) => {
    const feature = h3IndexesToGeoJSONPolygon(h3Index);
    return { ...feature, properties: { ...feature.properties, dai: daiValue } };
  });
  return featureCollection(features as any);
}

/**
 * It takes a bbox and a resolution, and returns a list of H3 indexes.
 * Due to missing coordinate wrapping support in H3 library, code has been added to treat +180/-180 singularity.
 * @param {number[]} bbox - Input bounding box (minx, miny, maxx, maxy).
 * @param {number} resolution - The resolution of the hexagons.
 * @returns An array of strings.
 */
export const bBoxToH3Cells = (bbox: number[], resolution: number): string[] => {
  if (!(bbox.length === 4)) throw new Error('bbox must contain 4 values (minx, miny, maxx, maxy)');
  if (!(bbox[0] < bbox[2])) throw new Error(`bbox X validation failed: ${bbox[0]} < ${bbox[2]}`);
  if (!(bbox[1] < bbox[3])) throw new Error(`bbox Y validation failed: ${bbox[1]} < ${bbox[3]}`);

  const longitudeWidth = bbox[2] - bbox[0];
  if (longitudeWidth < Number.EPSILON) {
    return [];
  }

  if (longitudeWidth > 180) {
    /*
    https://github.com/uber/h3-js/issues/191#issuecomment-2305167283
    The polygonToCells function will reject polygons with arcs > 180 degrees on longitude,
    because we do not currently enforce winding order so the area enclosed by the polygon
    is ambiguous (it could stretch across the antimeridian).
    */
    const midpoint = (bbox[0] + bbox[2]) / 2;
    const bboxLeft = [bbox[0], bbox[1], midpoint, bbox[3]];
    const bboxRight = [midpoint, bbox[1], bbox[2], bbox[3]];
    return mergeBboxesToH3(bboxLeft, bboxRight, resolution);
  }

  /*
     -inf <<< -180 <<< 0 <<< +180 <<< +inf
  1)   <--->    |      |       |             = shift(+360)
  2)         <--|-->   |       |             = split in two
  3)            |    <-|->     |             = split in two (h3.polygonToCells singularity)
  4)            |      |    <--|-->          = split in two
  5)            |      |       |  <--->      = shift(-360)
  */

  // 1)
  while (bbox[2] < -180) {
    bbox[0] += 360;
    bbox[2] += 360;
  }

  // 5)
  while (bbox[0] > 180) {
    bbox[0] -= 360;
    bbox[2] -= 360;
  }

  // 2)
  if (bbox[0] < -180) {
    const newLeft = bbox[0] + 360;
    const bboxLeft = [newLeft, bbox[1], 180, bbox[3]];
    const bboxRight = [-180, bbox[1], bbox[2], bbox[3]];
    return mergeBboxesToH3(bboxLeft, bboxRight, resolution);
  }

  // 4)
  if (bbox[2] > 180) {
    const newRight = bbox[2] - 360;
    const bboxLeft = [bbox[0], bbox[1], 180, bbox[3]];
    const bboxRight = [-180, bbox[1], newRight, bbox[3]];
    return mergeBboxesToH3(bboxLeft, bboxRight, resolution);
  }

  // 3)
  if (bbox[0] < 0.0 && bbox[2] > 0.0) {
    const bboxLeft = [bbox[0], bbox[1], 0.0, bbox[3]];
    const bboxRight = [0.0, bbox[1], bbox[2], bbox[3]];
    return mergeBboxesToH3(bboxLeft, bboxRight, resolution);
  }

  const coordinates = bBoxToPolygon(bbox);
  const geoJsonFeature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: coordinates,
    },
    properties: null,
  };

  return featureToH3Set(geoJsonFeature as any, resolution);
};

/**
 * Utility function to merge two bBoxToH3Cells calls
 * @param {H3IndexesThreshold} params parameters object
 * @param {number} resolution resolution value
 * @returns H3Cells and resolution
 */
const mergeBboxesToH3 = (bbox1: number[], bbox2: number[], resolution: number): string[] => {
  return Array.from(new Set([...bBoxToH3Cells(bbox1, resolution), ...bBoxToH3Cells(bbox2, resolution)]));
};

/**
 * It takes a bounding box and returns a polygon
 * @param {number[]} boundingBox - Input bounding box
 * @returns {Coordinates[]} A polygon in GeoJSON style (tuples of [lng, lat])
 */
export const bBoxToPolygon = (boundingBox: number[]) => {
  const polygon = bboxPolygon(boundingBox as [number, number, number, number, number, number]);
  const coordinates = polygon.geometry.coordinates[0];
  return coordinates;
};

export function largestPolygon(geometry: MultiPolygon): Polygon {
  if (!(geometry.type === 'MultiPolygon')) throw new Error('"geometry" must be a GeoJSON MultiPolygon');
  let maxArea = 0;
  let largestPolygon = null;
  geometry.coordinates.forEach((polygonCoords: any) => {
    const polyFeature = polygon(polygonCoords);
    const polyArea = area(polyFeature);
    if (polyArea > maxArea) {
      maxArea = polyArea;
      largestPolygon = polygonCoords;
    }
  });
  if (!(largestPolygon !== null)) throw new Error('No polygon found inside the MultiPolygon');
  return { ...geometry, type: 'Polygon', coordinates: largestPolygon! };
}

/**
 * Tells if the given point is inside of a feature collection.
 * @param point format of the point is [longitude, latitude]
 * @param featureCollection a GeoJSON feature collection. IT MUST CONTAIN ONLY POLYGONS OR MULTIPOLYGONS
 * @returns true or false according to if the given point is contained in the feature collection or not
 */
export function isPointInFeatureCollection(point: [number, number], featureCollection: any) {
  if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection?.features)) {
    throw new Error('"featureCollection" must be a valid feature collection');
  }
  const [lng, lat] = point;
  return featureCollection.features.some((feature: any) => booleanPointInPolygon([lng, lat], feature));
}
