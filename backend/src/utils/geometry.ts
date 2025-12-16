import { Polygon } from 'geojson';
import { assert } from 'console';

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
