import { describe, it, expect } from '@jest/globals';
import type { MultiPolygon } from 'geojson';
import { multiPolygonToWkb } from '../../src/utils/wkb';
import { getDataSource } from '../../src/utils/data-source';

describe('multiPolygonToWkb', () => {
  it('round-trips through PostGIS: a polygon with a hole plus a second simple polygon', async () => {
    const multiPolygon: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          // exterior ring, decimal + negative coordinates
          [
            [-73.9857, 40.7484],
            [-73.9, 40.7484],
            [-73.9, 40.8],
            [-73.9857, 40.8],
            [-73.9857, 40.7484],
          ],
          // hole
          [
            [-73.97, 40.76],
            [-73.95, 40.76],
            [-73.95, 40.77],
            [-73.97, 40.77],
            [-73.97, 40.76],
          ],
        ],
        [
          // second polygon, no hole
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ],
      ],
    };

    const wkb = multiPolygonToWkb(multiPolygon);

    const dataSource = await getDataSource();
    const [{ geojson }] = await dataSource.query('SELECT ST_AsGeoJSON(ST_GeomFromWKB($1), 15)::json AS geojson', [wkb]);

    expect(geojson).toEqual(multiPolygon);
  });
});
