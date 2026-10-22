import { describe, it, expect } from '@jest/globals';
import { georeferenceToWgs84, unwrapLongitudes } from '../../src/utils/georeference';
import type { Georeference } from '../../src/interfaces/File';

describe('unwrapLongitudes', () => {
  it('leaves corners clear of the antimeridian as they are', () => {
    const corners: Georeference = [
      [-81.16, -33.43],
      [-80.46, -33.43],
      [-80.46, -34.02],
      [-81.16, -34.02],
    ];
    expect(unwrapLongitudes(corners)).toEqual(corners);
  });

  it('carries corners across the antimeridian past 180° rather than round the globe', () => {
    expect(
      unwrapLongitudes([
        [178, -16],
        [-179, -16],
        [-179, -18],
        [178, -18],
      ]),
    ).toEqual([
      [178, -16],
      [181, -16],
      [181, -18],
      [178, -18],
    ]);
  });
});

describe('georeferenceToWgs84', () => {
  it("keeps an Alaska Albers raster's outline across the antimeridian", async () => {
    // Upper left, upper right, lower right, lower left, in EPSG:3338
    const corners = await georeferenceToWgs84(
      [
        [-2175765, 2383965],
        [1493175, 2383965],
        [1493175, 404505],
        [-2175765, 404505],
      ],
      'EPSG:3338',
    );

    const lons = corners!.map(([lon]) => lon);
    expect(lons[0]).toBeCloseTo(157.3677834, 6);
    expect(lons[1]).toBeCloseTo(-117.2863728 + 360, 6);
    expect(lons[2]).toBeCloseTo(-132.2705925 + 360, 6);
    expect(lons[3]).toBeCloseTo(175.499108, 6);
  });
});
