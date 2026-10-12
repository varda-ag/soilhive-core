import { describe, it, expect } from '@jest/globals';
import { samplingRangeOf, yearInSamplingRange, yearInSamplingRangeSql } from '../../../src/jobs/soil-indexes/samplingRange';

const kept = (range: Parameters<typeof yearInSamplingRange>[1]) =>
  [2014, 2015, 2016, 2018, 2019, undefined].filter(year => yearInSamplingRange(year, range));

describe('samplingRangeOf', () => {
  it('keeps only the sampling dates: absent when not given, null when null', () => {
    expect(samplingRangeOf({ min_depth: 0, licenses: ['cc-by'], raster_filters: { land_cover: [30] } })).toEqual({});
    expect(samplingRangeOf({ min_sampling_date: '2015-06-01', max_sampling_date: null, horizons: ['A'] })).toEqual({
      min_sampling_date: '2015-06-01',
      max_sampling_date: null,
    });
  });
});

describe('yearInSamplingRange', () => {
  it('keeps every score, with or without a year, when no bound is given', () => {
    expect(kept({})).toEqual([2014, 2015, 2016, 2018, 2019, undefined]);
  });

  it('keeps a year that overlaps the range at all, whatever the precision of its bounds', () => {
    expect(kept({ min_sampling_date: '2015-06-01', max_sampling_date: '2018-03' })).toEqual([2015, 2016, 2018]);
    expect(kept({ min_sampling_date: '2016' })).toEqual([2016, 2018, 2019]);
    expect(kept({ max_sampling_date: '2015-12-31' })).toEqual([2014, 2015]);
  });

  it('keeps only scores with no year for a null bound, and drops them for a dated one', () => {
    expect(kept({ min_sampling_date: null })).toEqual([undefined]);
    expect(yearInSamplingRange(null, { max_sampling_date: null })).toBe(true);
    expect(yearInSamplingRange(null, { min_sampling_date: '2015' })).toBe(false);
    expect(kept({ min_sampling_date: null, max_sampling_date: '2018' })).toEqual([]);
  });
});

describe('yearInSamplingRangeSql', () => {
  const sql = (range: Parameters<typeof yearInSamplingRangeSql>[1]) => {
    const params: unknown[] = [];
    const clause = yearInSamplingRangeSql('s.year', range, value => {
      params.push(value);
      return `$${params.length}`;
    });
    return { clause, params };
  };

  it("binds each dated bound's year", () => {
    expect(sql({ min_sampling_date: '2015-06-01', max_sampling_date: '2018-03' })).toEqual({
      clause: 's.year >= $1::int AND s.year <= $2::int',
      params: [2015, 2018],
    });
  });

  it('matches only a missing year for a null bound, and everything without bounds', () => {
    expect(sql({ max_sampling_date: null })).toEqual({ clause: 's.year IS NULL', params: [] });
    expect(sql({})).toEqual({ clause: 'TRUE', params: [] });
  });
});
