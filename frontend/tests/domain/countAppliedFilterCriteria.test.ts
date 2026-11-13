import { countAppliedFilterCriteria } from '../../src/domain/countAppliedFilterCriteria';
import { GISDataType } from '../../src/types/backend';

describe('countAppliedFilterCriteria', () => {
  it('counts no filter for a Filter with no parameters', () => {
    expect(countAppliedFilterCriteria(undefined)).toBe(0);
    expect(countAppliedFilterCriteria({})).toBe(0);
  });

  it('counts each soil property, data type and raster value', () => {
    expect(
      countAppliedFilterCriteria({
        soil_properties: ['ph', 'organic_carbon'],
        data_types: [GISDataType.RASTER],
        raster_filters: { land_cover: [1, 2], soil_groups: [7] },
      }),
    ).toBe(6);
  });

  it('counts the sampling dates, the depth range and the data access once each', () => {
    expect(
      countAppliedFilterCriteria({
        min_sampling_date: '2010-01-01',
        max_sampling_date: '2020-12-31',
        min_depth: 0,
        max_depth: 30,
        visibility: 'public',
      }),
    ).toBe(3);
  });

  it('counts a depth range starting at the surface', () => {
    expect(countAppliedFilterCriteria({ min_depth: 0 })).toBe(1);
  });
});
