import { applyDataScopeCriteria } from '../../src/domain';
import { GISDataType, type FilterCriteria } from 'types/backend';

describe('applyDataScopeCriteria', () => {
  describe("name 'type'", () => {
    it('sets data_types for a partial selection', () => {
      const result = applyDataScopeCriteria({}, 'type', ['point', 'raster']);
      expect(result).toEqual({ data_types: ['point', 'raster'] });
    });

    it('removes the key when nothing is selected', () => {
      const result = applyDataScopeCriteria({ data_types: [GISDataType.POINT] }, 'type', []);
      expect('data_types' in result).toBe(false);
    });

    it('removes the key when all static options are selected', () => {
      const result = applyDataScopeCriteria({ data_types: [GISDataType.POINT] }, 'type', ['point', 'raster', 'polygonal']);
      expect('data_types' in result).toBe(false);
    });

    it('preserves unrelated criteria', () => {
      const prev: FilterCriteria = { soil_properties: ['ph'], visibility: 'private' };
      const result = applyDataScopeCriteria(prev, 'type', ['point']);
      expect(result).toEqual({ soil_properties: ['ph'], visibility: 'private', data_types: ['point'] });
    });
  });

  describe("name 'visibility'", () => {
    it('sets the scalar when exactly one option is selected', () => {
      expect(applyDataScopeCriteria({}, 'visibility', ['private'])).toEqual({ visibility: 'private' });
      expect(applyDataScopeCriteria({}, 'visibility', ['public'])).toEqual({ visibility: 'public' });
    });

    it('removes the key when nothing is selected', () => {
      const result = applyDataScopeCriteria({ visibility: 'public' }, 'visibility', []);
      expect('visibility' in result).toBe(false);
    });

    it('removes the key when both options are selected', () => {
      const result = applyDataScopeCriteria({ visibility: 'public' }, 'visibility', ['private', 'public']);
      expect('visibility' in result).toBe(false);
    });

    it('preserves unrelated criteria', () => {
      const prev: FilterCriteria = { data_types: [GISDataType.RASTER], min_depth: 10 };
      const result = applyDataScopeCriteria(prev, 'visibility', ['private']);
      expect(result).toEqual({ data_types: [GISDataType.RASTER], min_depth: 10, visibility: 'private' });
    });
  });

  it('returns prevFilters unchanged for other filter names', () => {
    const prev: FilterCriteria = { data_types: [GISDataType.POINT] };
    expect(applyDataScopeCriteria(prev, 'search', ['foo'])).toBe(prev);
  });

  it('does not mutate prevFilters', () => {
    const prev: FilterCriteria = { data_types: [GISDataType.POINT], visibility: 'public' };
    applyDataScopeCriteria(prev, 'type', []);
    applyDataScopeCriteria(prev, 'visibility', []);
    expect(prev).toEqual({ data_types: [GISDataType.POINT], visibility: 'public' });
  });
});
