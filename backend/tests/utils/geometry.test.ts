import { describe, it, expect } from '@jest/globals';
import { isAxisAlignedBboxPolygon } from '../../src/utils/geometry';

describe('isAxisAlignedBboxPolygon', () => {
  it('returns true for an axis-aligned rectangle', () => {
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(true);
  });

  it('returns false for a rotated/skewed quadrilateral', () => {
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0.5],
          [2, 0],
          [1, -0.5],
          [0, 0],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(false);
  });

  it('returns false for a polygon with a hole', () => {
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0, 4],
          [4, 4],
          [4, 0],
          [0, 0],
        ],
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
          [1, 1],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(false);
  });

  it('returns false for a MultiPolygon', () => {
    const aoi = {
      type: 'MultiPolygon' as const,
      coordinates: [
        [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(false);
  });

  it('returns false for a triangle', () => {
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(false);
  });

  it('returns false for a pentagon', () => {
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1.5, 0.5],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    expect(isAxisAlignedBboxPolygon(aoi)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAxisAlignedBboxPolygon(null)).toBe(false);
  });
});
