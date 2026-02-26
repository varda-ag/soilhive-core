import { Polygon } from 'geojson';
import { assert } from 'console';
import { GISDataType } from '../types/data';

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
