import { act, renderHook } from '@testing-library/react';
import useDataScopeFilters from 'hooks/useDataScopeFilters';
import useAvailability from 'hooks/useAvailability';
import { yearRangeToDatasetFilters } from '../../src/adapters';
import { DATA_ACCESS_ITEMS, DATA_TYPE_ITEMS } from '../../src/configuration/filters';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../src/adapters', () => ({
  yearRangeToDatasetFilters: jest.fn(),
}));

describe('useDataScopeFilters', () => {
  const mockSetSelectedTimeFilter = jest.fn();
  const mockSetFrontendFilters = jest.fn();
  const mockSetDatasetFilters = jest.fn();

  const mockYearRangeToDatasetFilters = jest.fn();

  const defaultAvailabilityState = {
    isLoading: false,
    allDatasets: [],
    selectedTimeFilter: { min: 0, max: 0 },
    datasetFrontendFilters: { type: [], visibility: [] },
    setSelectedTimeFilter: mockSetSelectedTimeFilter,
    setFrontendFilters: mockSetFrontendFilters,
    setDatasetFilters: mockSetDatasetFilters,
  };

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue(defaultAvailabilityState);
    (yearRangeToDatasetFilters as jest.Mock).mockImplementation(mockYearRangeToDatasetFilters);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns default timeFilterRange {0,0} when no datasets', () => {
    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.timeFilterRange).toEqual({ min: 0, max: 0 });
  });

  it('computes timeFilterRange from dataset dateStart/dateEnd', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      allDatasets: [
        { properties: { dateStart: 1990, dateEnd: 2001 } },
        { properties: { dateStart: 1980, dateEnd: 2010 } },
        { properties: { dateStart: 2005, dateEnd: 2020 } },
      ],
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.timeFilterRange).toEqual({ min: 1980, max: 2020 });
  });

  it('handleTimeFilterChange sets selectedTimeFilter and merges dataset filters via setDatasetFilters', () => {
    const { result } = renderHook(() => useDataScopeFilters());

    act(() => {
      result.current.handleTimeFilterChange({ min: 2001, max: 2005 });
    });

    expect(mockSetSelectedTimeFilter).toHaveBeenCalledWith({ min: 2001, max: 2005 });
    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);
    const updater = mockSetDatasetFilters.mock.calls[0][0];
    updater();

    expect(mockYearRangeToDatasetFilters).toHaveBeenCalledWith({ min: 2001, max: 2005 });
  });

  it('timeFilterPills is null unless both min and max are set', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      selectedTimeFilter: { min: undefined, max: 2020 },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.timeFilterPills).toBeNull();
  });

  it('timeFilterPills contains a pill when min/max set', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      allDatasets: [
        { properties: { dateStart: 1990, dateEnd: 2001 } },
        { properties: { dateStart: 1980, dateEnd: 2010 } },
        { properties: { dateStart: 2005, dateEnd: 2020 } },
      ],
      selectedTimeFilter: { min: 2000, max: 2010 },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.timeFilterPills).toEqual([{ id: 'time', label: '2000-2010', disabled: false }]);
  });

  it('timeFilterPills contains a disabled pill when min/max set and timeFilterRange is not defined', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      selectedTimeFilter: { min: 2000, max: 2010 },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.timeFilterPills).toEqual([{ id: 'time', label: '2000-2010', disabled: true }]);
  });

  it('typeFilterOptions includes only types present in datasets and in DATA_TYPE_ITEMS', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      allDatasets: [
        { dataType: 'raster', properties: {} },
        { dataType: 'raster', properties: {} },
        { dataType: 'point', properties: {} },
        { dataType: 'unknown', properties: {} },
      ],
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.typeFilterOptions).toEqual(DATA_TYPE_ITEMS.filter((x: any) => ['raster', 'point'].includes(x.id)));
  });

  it('typeFilterPills marks selected types disabled if not available and not loading', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      allDatasets: [{ dataType: 'raster', properties: {} }],
      datasetFrontendFilters: { type: ['raster', 'point'], visibility: [] },
    });

    const { result } = renderHook(() => useDataScopeFilters());

    const pills = result.current.typeFilterPills;
    const rasterPill = pills.find(p => p.id === 'raster');
    const pointPill = pills.find(p => p.id === 'point');

    expect(rasterPill?.disabled).toBe(false);
    expect(pointPill?.disabled).toBe(true);
  });

  it('typeFilterPills does not mark unavailable selected types disabled while loading', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isLoading: true,
      allDatasets: [{ dataType: 'raster', properties: {} }],
      datasetFrontendFilters: { type: ['point'], visibility: [] },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    const pointPill = result.current.typeFilterPills.find(p => p.id === 'point');
    expect(pointPill?.disabled).toBe(false);
  });

  it("typeFilterPillRemove calls setFrontendFilters with removed id and name 'type'", () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isLoading: true,
      datasetFrontendFilters: { type: ['raster', 'point'], visibility: [] },
    });

    const { result } = renderHook(() => useDataScopeFilters());

    act(() => {
      result.current.typeFilterPillRemove('point');
    });

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['raster'], 'type');
  });

  it('accessFilterPills is derived from datasetFrontendFilters.visibility', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      datasetFrontendFilters: { type: [], visibility: ['public'] },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.accessFilterPills).toEqual((DATA_ACCESS_ITEMS as any).filter((x: any) => x.id === 'public'));
  });

  it("accessFilterPillRemove calls setFrontendFilters with removed id and name 'visibility'", () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      datasetFrontendFilters: { type: [], visibility: ['public', 'private'] },
    });

    const { result } = renderHook(() => useDataScopeFilters());

    act(() => {
      result.current.accessFilterPillRemove('private');
    });

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['public'], 'visibility');
  });

  it('hasUnavailableScopeSelected is true if any pill is disabled (time/type/access)', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isLoading: false,
      allDatasets: [{ dataType: 'raster', properties: { dateStart: 2000, dateEnd: 2010 } }],
      datasetFrontendFilters: { type: ['point'], visibility: [] },
      selectedTimeFilter: { min: 2000, max: 2010 },
    });

    const { result } = renderHook(() => useDataScopeFilters());
    expect(result.current.hasUnavailableScopeSelected).toBe(true);
  });
});
