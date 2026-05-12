import { renderHook, act } from '@testing-library/react';
import { useRasterFilters } from 'hooks/useRasterFilters';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const useAvailabilityMock = useAvailability as jest.MockedFunction<typeof useAvailability>;

const SOIL_GROUPS_CATEGORY = {
  id: 'soil_groups',
  name: 'Soil Groups',
  description: 'World Reference Base for Soil Resources',
  enabled: true,
  mappings: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
};

function buildAvailabilityMock(overrides = {}) {
  return {
    datasetFilters: { raster_filters: undefined },
    setDatasetFilters: jest.fn(),
    geometryFilterResults: [],
    allRasterCategories: [SOIL_GROUPS_CATEGORY],
    isLoadingRasterCategories: false,
    ...overrides,
  };
}

describe('useRasterFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when no categoryId is provided', () => {
    it('returns empty arrays and undefined category', () => {
      useAvailabilityMock.mockReturnValue(buildAvailabilityMock() as any);

      const { result } = renderHook(() => useRasterFilters());

      expect(result.current.category).toBeUndefined();
      expect(result.current.availableOptions).toEqual([]);
      expect(result.current.selectedValues).toEqual([]);
      expect(result.current.pillSelections).toEqual([]);
    });

    it('handleOnChange does nothing if categoryId is undefined', () => {
      const setDatasetFilters = jest.fn();
      useAvailabilityMock.mockReturnValue(buildAvailabilityMock({ setDatasetFilters }) as any);

      const { result } = renderHook(() => useRasterFilters());

      act(() => result.current.handleOnChange([1, 2]));

      expect(setDatasetFilters).not.toHaveBeenCalled();
    });
  });

  describe('availableOptions', () => {
    it('filters options to only those present in geometryFilterResults when raster_filters exist', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          geometryFilterResults: { datasets: [{ id: 'ds-1' }], raster_filters: { soil_groups: [1, 3] } },
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.availableOptions).toEqual([
        { label: 'Acrisols', value: 1 },
        { label: 'Gleysols', value: 3 },
      ]);
    });

    it('merges raster_filter values across multiple datasets', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          geometryFilterResults: { datasets: [{ id: 'ds-1' }, { id: 'ds-2' }], raster_filters: { soil_groups: [1, 3, 4] } },
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.availableOptions).toEqual([
        { label: 'Acrisols', value: 1 },
        { label: 'Gleysols', value: 3 },
        { label: 'Leptosols', value: 4 },
      ]);
    });
  });

  describe('selectedValues', () => {
    it('returns empty array when no raster_filters are set', () => {
      useAvailabilityMock.mockReturnValue(buildAvailabilityMock() as any);

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.selectedValues).toEqual([]);
    });

    it('returns the selected values for the given categoryId', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          datasetFilters: { raster_filters: { soil_groups: [1, 2] } },
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.selectedValues).toEqual([1, 2]);
    });
  });

  describe('pillSelections', () => {
    it('returns pills with correct labels for selected values', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          datasetFilters: { raster_filters: { soil_groups: [1, 2] } },
          geometryFilterResults: { datasets: [{ id: 'ds-1' }], raster_filters: { soil_groups: [1, 2] } },
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.pillSelections).toEqual([
        { id: '1', label: 'Acrisols', disabled: false },
        { id: '2', label: 'Ferralsols', disabled: false },
      ]);
    });

    it('marks a pill as disabled when its value is not in availableOptions and not loading', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          datasetFilters: { raster_filters: { soil_groups: [1, 2] } },
          geometryFilterResults: { datasets: [{ id: 'ds-1' }], raster_filters: { soil_groups: [1] } }, // value 2 (Ferralsols) is not available
          isLoadingRasterCategories: false,
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.pillSelections).toEqual([
        { id: '1', label: 'Acrisols', disabled: false },
        { id: '2', label: 'Ferralsols', disabled: true },
      ]);
    });

    it('does not mark pills as disabled while still loading', () => {
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          datasetFilters: { raster_filters: { soil_groups: [1, 2] } },
          geometryFilterResults: { datasets: [{ id: 'ds-1' }], raster_filters: { soil_groups: [1] } },
          isLoadingRasterCategories: true, // still loading
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      expect(result.current.pillSelections).toEqual([
        { id: '1', label: 'Acrisols', disabled: false },
        { id: '2', label: 'Ferralsols', disabled: false },
      ]);
    });
  });

  describe('handleOnChange', () => {
    it('adds selected values to the raster_filters', () => {
      // setDatasetFilters, from the AvailabilityContex, is called with an updater function (not a value)
      // es: setDatasetFilters(prev => ({ ...prev, raster_filters: { soil_groups: [1, 2] } }))
      // for this reason we need to grab the updater function from the mock (setDatasetFilters.mock.calls[0][0])
      // we then call it passing the previous value ({ raster_filters: undefined })

      const setDatasetFilters = jest.fn();
      useAvailabilityMock.mockReturnValue(buildAvailabilityMock({ setDatasetFilters }) as any);

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      act(() => result.current.handleOnChange([1, 2]));

      const updater = setDatasetFilters.mock.calls[0][0];
      const nextState = updater({ raster_filters: undefined });
      expect(nextState.raster_filters).toEqual({ soil_groups: [1, 2] });
    });

    it('removes the category key from raster_filters when values are empty', () => {
      const setDatasetFilters = jest.fn();
      useAvailabilityMock.mockReturnValue(buildAvailabilityMock({ setDatasetFilters }) as any);

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      act(() => result.current.handleOnChange([])); // new state is empty

      const updater = setDatasetFilters.mock.calls[0][0];
      const nextState = updater({ raster_filters: { soil_groups: [1] } }); // parameter is previous state
      expect(nextState.raster_filters).toBeUndefined();
    });
  });

  describe('handlePillRemove', () => {
    it('removes the value matching the given id from selectedValues', () => {
      const setDatasetFilters = jest.fn();
      useAvailabilityMock.mockReturnValue(
        buildAvailabilityMock({
          setDatasetFilters,
          datasetFilters: { raster_filters: { soil_groups: [1, 2, 3] } },
        }) as any,
      );

      const { result } = renderHook(() => useRasterFilters('soil_groups'));

      act(() => result.current.handlePillRemove('2'));

      const updater = setDatasetFilters.mock.calls[0][0]; // see aboe for updater explanation
      const nextState = updater({ raster_filters: { soil_groups: [1, 2, 3] } });
      expect(nextState.raster_filters.soil_groups).toEqual([1, 3]);
    });
  });
});
