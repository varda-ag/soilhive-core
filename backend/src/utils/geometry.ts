import * as turf from '@turf/turf';
import { Feature, MultiPolygon, Polygon, FeatureCollection } from 'geojson';
import { assert } from 'console';
import { GISDataType } from '../types/data';
import { geohashBboxes, geohashDecodeBbox } from './geohash';
import { Envelope } from '../interfaces/RasterLayer';

export const getPolygonFromBbox = (bbox: number[]): Polygon => {
  assert(bbox.length === 4, 'Bounding box must have exactly four numbers: [minx, miny, maxx, maxy]');
  const [minx, miny, maxx, maxy] = bbox;
  return {
    coordinates: [
      [
        [minx!, miny!],
        [maxx!, miny!],
        [maxx!, maxy!],
        [minx!, maxy!],
        [minx!, miny!],
      ],
    ],
    type: 'Polygon',
  };
};

export const parseBboxString = (input: string): [number, number, number, number] => {
  const parts = input.split(',');
  if (parts.length !== 4) throw new Error('Bounding box must have exactly 4 comma-separated values');

  const [minLon, minLat, maxLon, maxLat] = parts.map((p, i) => {
    const n = Number(p.trim());
    if (!Number.isFinite(n)) throw new Error(`Bounding box value at index ${i} is not a valid number: "${p.trim()}"`);
    return n;
  }) as [number, number, number, number];

  if (minLon < -180 || minLon > 180) throw new Error(`minLon out of range [-180, 180]: ${minLon}`);
  if (maxLon < -180 || maxLon > 180) throw new Error(`maxLon out of range [-180, 180]: ${maxLon}`);
  if (minLat < -90 || minLat > 90) throw new Error(`minLat out of range [-90, 90]: ${minLat}`);
  if (maxLat < -90 || maxLat > 90) throw new Error(`maxLat out of range [-90, 90]: ${maxLat}`);

  return [minLon, minLat, maxLon, maxLat];
};

export const toGisDatatype = (input: string): GISDataType => {
  switch (input) {
    case 'ST_Point':
      return GISDataType.POINT;
    case 'ST_Polygon':
      return GISDataType.POLYGONAL;
    default:
      throw new Error(`Unsupported geometry type: ${input}`);
  }
};

export const geometryUnion = (geometries: (Polygon | MultiPolygon)[]): Polygon | MultiPolygon => {
  assert(geometries.length > 0, 'Do not call geometryUnion without input geometries');
  if (geometries.length === 1) {
    return geometries[0]!;
  }
  const features = geometries.map(geom => turf.feature(geom) as Feature<Polygon | MultiPolygon>);
  const featureCollection = turf.featureCollection(features);
  return turf.union(featureCollection)!.geometry;
};

export const toMultiPolygon = (fc: FeatureCollection): MultiPolygon => {
  const geoms = fc.features.map(f => f.geometry).filter((g): g is Polygon | MultiPolygon => g !== null);
  if (geoms.length === 0) return { type: 'MultiPolygon', coordinates: [] };
  const union = turf.union(turf.featureCollection(geoms.map(g => turf.feature(g))));
  if (!union) return { type: 'MultiPolygon', coordinates: [] };
  const geom = union.geometry;
  return geom.type === 'MultiPolygon' ? geom : { type: 'MultiPolygon', coordinates: [geom.coordinates] };
};

export const polygonToGeohashes = (geometry: Polygon | MultiPolygon, precision: number): string[] => {
  const [minX, minY, maxX, maxY] = turf.bbox(geometry);
  return geohashBboxes(minY, minX, maxY, maxX, precision);
};

export const footprintToGeohashes = (footprint: Polygon | MultiPolygon, precision: number): string[] => {
  const [minX, minY, maxX, maxY] = turf.bbox(turf.feature(footprint));
  const cells = geohashBboxes(minY, minX, maxY, maxX, precision);

  return cells.filter(hash => {
    const [cellMinLat, cellMinLon, cellMaxLat, cellMaxLon] = geohashDecodeBbox(hash);
    const cell = turf.bboxPolygon([cellMinLon, cellMinLat, cellMaxLon, cellMaxLat]);
    return turf.booleanIntersects(cell, turf.feature(footprint));
  });
};

export const envelopeFromGeoJSON = (geometry: Polygon | MultiPolygon): Envelope => {
  const [minX, minY, maxX, maxY] = turf.bbox(geometry);
  return { minX, minY, maxX, maxY };
};
