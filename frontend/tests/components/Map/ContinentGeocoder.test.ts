import {
  continentNameMatches,
  continentLocalGeocoder,
  isContinentResult,
  filterDuplicateContinentPoints,
} from 'components/Map/ContinentGeocoder';
import type { CarmenGeojsonFeature } from '@maplibre/maplibre-gl-geocoder';

describe('continentNameMatches', () => {
  it.each([
    ['whole name prefix matches', 'Europe', 'euro', true],
    ['whole name prefix matches exactly', 'Africa', 'africa', true],
    ['multi-word name matches via its leading words', 'North America', 'north am', true],
    ['multi-word name matches via a later word', 'North America', 'america', true],
    ['multi-word name matches via a later word (other continent)', 'South America', 'america', true],
    ['unrelated prefix does not match', 'Oceania', 'aus', false],
    ['no match for an unrelated query', 'Asia', 'zzz', false],
  ])('%s', (_desc, name, query, expected) => {
    expect(continentNameMatches(name, query)).toBe(expected);
  });
});

describe('continentLocalGeocoder', () => {
  it('returns [] for an empty (or whitespace-only) query', () => {
    expect(continentLocalGeocoder('')).toEqual([]);
    expect(continentLocalGeocoder('   ')).toEqual([]);
  });

  it('returns a single polygon-backed feature for an exact continent name', () => {
    const results = continentLocalGeocoder('Africa');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('continent.Africa');
    expect(results[0].place_name).toBe('Africa');
    expect(results[0].geometry.type).toBe('Point'); // top-level geometry is always a centroid point
    expect((results[0] as any).original_geometry.type).toBe('MultiPolygon'); // the real continent boundary
  });

  it('returns both North and South America for "america"', () => {
    const results = continentLocalGeocoder('america');
    expect(results.map(r => r.place_name).sort()).toEqual(['North America', 'South America']);
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    const results = continentLocalGeocoder('  AFRICA  ');
    expect(results.map(r => r.place_name)).toEqual(['Africa']);
  });

  it('returns [] when no continent matches', () => {
    expect(continentLocalGeocoder('Atlantis')).toEqual([]);
  });
});

describe('isContinentResult', () => {
  it('returns true for a continent-sourced feature id', () => {
    expect(isContinentResult({ id: 'continent.Africa' } as CarmenGeojsonFeature)).toBe(true);
  });

  it('returns false for a non-continent feature id', () => {
    expect(isContinentResult({ id: 'way/12345' } as CarmenGeojsonFeature)).toBe(false);
  });
});

describe('filterDuplicateContinentPoints', () => {
  const continentResult = {
    id: 'continent.Africa',
    place_name: 'Africa',
    original_geometry: { type: 'MultiPolygon' },
  } as unknown as CarmenGeojsonFeature;

  it('always keeps continent-sourced results', () => {
    expect(filterDuplicateContinentPoints(continentResult, 0, [continentResult])).toBe(true);
  });

  it('drops a Nominatim point result with the same name as a continent result', () => {
    const duplicate = {
      id: 'nominatim-1',
      place_name: 'Africa',
      original_geometry: { type: 'Point' },
    } as unknown as CarmenGeojsonFeature;
    expect(filterDuplicateContinentPoints(duplicate, 1, [continentResult, duplicate])).toBe(false);
  });

  it('keeps a Nominatim point result with a different name', () => {
    const other = {
      id: 'nominatim-2',
      place_name: 'Africa Building, Lagos',
      original_geometry: { type: 'Point' },
    } as unknown as CarmenGeojsonFeature;
    expect(filterDuplicateContinentPoints(other, 1, [continentResult, other])).toBe(true);
  });

  it('keeps non-point Nominatim results regardless of name', () => {
    const country = {
      id: 'nominatim-3',
      place_name: 'Africa',
      original_geometry: { type: 'Polygon' },
    } as unknown as CarmenGeojsonFeature;
    expect(filterDuplicateContinentPoints(country, 1, [continentResult, country])).toBe(true);
  });

  it('keeps point results when no allResults array is provided', () => {
    const point = {
      id: 'nominatim-4',
      place_name: 'Africa',
      original_geometry: { type: 'Point' },
    } as unknown as CarmenGeojsonFeature;
    expect(filterDuplicateContinentPoints(point)).toBe(true);
  });

  it('keeps a point result with a missing place_name without throwing', () => {
    const point = {
      id: 'nominatim-5',
      original_geometry: { type: 'Point' },
    } as unknown as CarmenGeojsonFeature;
    expect(filterDuplicateContinentPoints(point, 1, [continentResult, point])).toBe(true);
  });
});
