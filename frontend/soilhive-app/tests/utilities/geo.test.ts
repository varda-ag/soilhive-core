import {
  h3IndexesToGeoJSONPolygon,
  h3IndexesToGeoJSONPolygons,
  bBoxToH3Cells,
  bBoxToPolygon,
  largestPolygon,
  isPointInFeatureCollection,
} from '../../src/utilities/geo';

import type { H3Index } from 'h3-js';
import type { MultiPolygon } from 'geojson';

describe('h3IndexesToGeoJSONPolygon', () => {
  const mockH3Index: H3Index = '8930548470bffff';

  it('creates polygon with normalization and lerp scaling for closed boundary', () => {
    const result = h3IndexesToGeoJSONPolygon(mockH3Index);
    expect(result).toEqual({
      type: 'Feature',
      properties: { h3Index: mockH3Index },
      geometry: { type: 'Polygon', coordinates: expect.any(Array) },
    });
    expect(result.geometry.coordinates[0]).toHaveLength(7);
  });
});

describe('h3IndexesToGeoJSONPolygons', () => {
  it('creates feature collection from multiple H3 indexes', () => {
    const indexes = ['h3-1', 'h3-2'];
    const result = h3IndexesToGeoJSONPolygons(indexes);
    expect(result.type).toBe('FeatureCollection');
    expect(result.features).toHaveLength(2);
  });
});

describe('bBoxToH3Cells', () => {
  it('returns error for zero width bbox', () => {
    expect(() => bBoxToH3Cells([0, 0, 0, 0], 5)).toThrow('bbox X validation failed: 0 < 0');
  });

  it('splits wide bbox >180', () => {
    const result = bBoxToH3Cells([-200, 0, 200, 10], 5);
    expect(result).toEqual(expect.any(Array));
  });

  it('shifts bbox < -180', () => {
    const bbox = [-200, 0, -190, 10];
    expect(bBoxToH3Cells(bbox, 5)).toEqual(expect.any(Array));
  });

  it('shifts bbox > 180', () => {
    const bbox = [170, 0, 190, 10];
    expect(bBoxToH3Cells(bbox, 5)).toEqual(expect.any(Array));
  });

  it('splits crossing 0', () => {
    const bbox = [-10, 0, 10, 10];
    expect(bBoxToH3Cells(bbox, 5)).toEqual(expect.any(Array));
  });

  it('uses polygonToCells for normal bbox', () => {
    const result = bBoxToH3Cells([0, 0, 10, 10], 5);
    expect(result).toHaveLength(5842);
  });

  it('throws on invalid bbox length', () => {
    expect(() => bBoxToH3Cells([1, 2, 3], 5)).toThrow('bbox must contain 4 values (minx, miny, maxx, maxy)');
  });

  it('throws on invalid bbox x order', () => {
    expect(() => bBoxToH3Cells([10, 0, 0, 10], 5)).toThrow('bbox X validation failed: 10 < 0');
  });

  it('throws on invalid bbox y order', () => {
    expect(() => bBoxToH3Cells([0, 10, 10, 0], 5)).toThrow('bbox Y validation failed: 10 < 0');
  });
});

describe('bBoxToPolygon', () => {
  it('converts bbox to polygon coordinates', () => {
    const bbox = [0, 0, 10, 10];
    const result = bBoxToPolygon(bbox);
    expect(result).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
  });
});

describe('largestPolygon', () => {
  it('selects largest polygon by area in MultiPolygon', () => {
    const multi: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ], // small
        [
          [
            [0, 0],
            [3, 0],
            [3, 3],
            [0, 3],
            [0, 0],
          ],
        ], // large
      ],
    };
    const result = largestPolygon(multi);
    expect(result.type).toBe('Polygon');
    expect(result.coordinates).toEqual(multi.coordinates[1]);
  });

  it('throws if not MultiPolygon', () => {
    expect(() => largestPolygon({ type: 'Polygon' } as any)).toThrow('must be a GeoJSON MultiPolygon');
  });

  it('throws if no polygons found', () => {
    expect(() => largestPolygon({ type: 'MultiPolygon', coordinates: [] })).toThrow('No polygon found');
  });
});

describe('isPointInFeatureCollection', () => {
  it('returns true if point in any feature', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(isPointInFeatureCollection([5, 5], fc)).toBe(true);
  });

  it('throws if invalid feature collection', () => {
    expect(() => isPointInFeatureCollection([0, 0], { type: 'Invalid' })).toThrow('"featureCollection" must be a valid feature collection');
  });
});
