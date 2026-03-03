import { describe, it, expect } from '@jest/globals';
import { selectOverviewTable } from '../../src/utils/raster';

describe('raster tests', () => {
  it.each([
    [1_000_000, 'raster'], // Cultivated field (1 Km2)
    [2_000_000, 'raster'],
    [25_000_000, 'o_2_raster'], // 5x5 Km2
    [100_000_000, 'o_4_raster'],
    [500_000_000, 'o_8_raster'],
    [600_000_000, 'o_8_raster'], // City of Madrid
    [700_000_000, 'o_8_raster'],
    [1_000_000_000, 'o_8_raster'],
    [5_000_000_000, 'o_16_raster'],
    [22_000_000_000, 'o_16_raster'], // Emilia Romagna
    [300_000_000_000, 'o_16_raster'], // Italy
    [10_000_000_000_000, 'o_16_raster'], // USA
  ])('selectOverviewTable should work as expected', (aoiM2, expected) => {
    const baseTable = 'raster';
    const table = selectOverviewTable(baseTable, aoiM2);
    expect(table).toEqual(expected);
  });
});
