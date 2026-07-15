import { act, renderHook } from '@testing-library/react';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';
import useAvailability from 'hooks/useAvailability';
import { collectAllIds, getBranchIds } from 'components/UI/NestedCheckbox/nestedCheckboxHelpers';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI/NestedCheckbox/nestedCheckboxHelpers', () => ({
  collectAllIds: jest.fn(),
  getBranchIds: jest.fn(),
}));

describe('useSoilPropertiesFilters', () => {
  const mockSetSelectedSoilProperties = jest.fn();
  const mockSetDatasetFilters = jest.fn();

  const allSoilProperties = [
    { id: '1', property_name: 'Root A', parent_property_id: null, category_id: 'chemical' },
    { id: '2', property_name: 'Leaf A1', parent_property_id: '1', category_id: 'chemical' },
    { id: '3', property_name: 'Root B', parent_property_id: null, category_id: 'biological' },
    { id: '4', property_name: 'Leaf B1', parent_property_id: '3', category_id: 'biological' },
    { id: '5', property_name: 'Root C', parent_property_id: null, category_id: 'chemical' },
  ];

  const filteredSoilProperties = [
    { id: '1', property_name: 'Root A', parent_property_id: null, category_id: 'chemical' },
    { id: '2', property_name: 'Leaf A1', parent_property_id: '1', category_id: 'chemical' },
    { id: '4', property_name: 'Leaf B1', parent_property_id: '3', category_id: 'biological' },
    { id: '5', property_name: 'Root C', parent_property_id: null, category_id: 'chemical' },
  ];

  const categories = [
    { id: 'biological', category_name: 'Biological' },
    { id: 'chemical', category_name: 'Chemical' },
    { id: 'physical', category_name: 'Physical' },
  ];

  const defaultAvailabilityState = {
    isLoading: false,
    isNoData: false,
    isNoFilteredData: false,
    allSoilProperties,
    filteredSoilProperties,
    selectedSoilProperties: [],
    categories,
    setSelectedSoilProperties: mockSetSelectedSoilProperties,
    setDatasetFilters: mockSetDatasetFilters,
  };

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue(defaultAvailabilityState);
    (collectAllIds as jest.Mock).mockImplementation((node: any) => {
      // return id + children's ids (1 level deep) just to simulate
      const ids: string[] = [node.id];
      for (const c of node.children ?? []) ids.push(c.id);
      return ids;
    });
    (getBranchIds as jest.Mock).mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('builds nestedSoilProperties tree and includes missing roots that have children', () => {
    const { result } = renderHook(() => useSoilPropertiesFilters());

    // Expect roots include "1" and "3" (3 wasn't in filtered roots, but has child "4" so it's added)
    const roots = result.current.nestedSoilProperties.map(n => n.id).sort();
    expect(roots).toEqual(['1', '3', '5']);

    // Root A has child Leaf A1
    const rootA = result.current.nestedSoilProperties.find(n => n.id === '1')!;
    expect(rootA.children?.map(c => c.id)).toEqual(['2']);

    // Root B has child Leaf B1
    const rootB = result.current.nestedSoilProperties.find(n => n.id === '3')!;
    expect(rootB.children?.map(c => c.id)).toEqual(['4']);
  });

  it('calculates categorizedSoilProperties correctly', () => {
    const { result } = renderHook(() => useSoilPropertiesFilters());

    const cats = result.current.categorizedSoilProperties;
    expect(cats.map(c => c.id)).toEqual(['biological', 'chemical']);

    const chemical = result.current.categorizedSoilProperties.find(c => c.id === 'chemical')!;
    const biological = result.current.categorizedSoilProperties.find(c => c.id === 'biological')!;

    expect(chemical.nodes.map(n => n.id)).toEqual(['1', '5']);
    expect(biological.nodes.map(n => n.id)).toEqual(['3']);
  });

  it('links children to existing parents properties', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      allSoilProperties: [
        { id: 'p1', property_name: 'Parent', parent_property_id: null },
        { id: 'c1', property_name: 'Child', parent_property_id: 'p1' },
      ],
      filteredSoilProperties: [
        { id: 'p1', property_name: 'Parent', parent_property_id: null },
        { id: 'c1', property_name: 'Child', parent_property_id: 'p1' },
        { id: 'c2', property_name: 'Child', parent_property_id: 'p2' },
      ],
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    expect(result.current.nestedSoilProperties.map(n => n.id)).toEqual(['p1']);
    expect(result.current.nestedSoilProperties[0].children?.map(c => c.id)).toEqual(['c1']);
  });

  it('computes pillSelections for selected properties and marks disabled if not available and not loading', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isLoading: false,
      selectedSoilProperties: ['2', '4'], // 2 is available, 4 is NOT available per mock above
    });

    // availableSoilPropertiesIds will come from collectAllIds called on each root
    // Let's say only ["1","2"] are available; "3" selected but not available => disabled
    (collectAllIds as jest.Mock).mockImplementation((node: any) => {
      if (node.id === '1') return ['1', '2'];
      if (node.id === '3') return ['3']; // pretend "4" not available
      return [node.id];
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    const pills = result.current.pillSelections;

    // We only create pills for selected IDs that exist in allSoilProperties ("2" and "4")
    expect(pills.map(p => p.id).sort()).toEqual(['2', '4']);

    const pill2 = pills.find(p => p.id === '2')!;
    const pill4 = pills.find(p => p.id === '4')!;

    expect(pill2.disabled).toBe(false);
    expect(pill4.disabled).toBe(true);

    expect(result.current.hasUnavailablePropertySelected).toBe(true);
  });

  it('does not mark pills disabled while loading', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isLoading: true,
      selectedSoilProperties: ['4'],
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    expect(result.current.pillSelections).toEqual([{ id: '4', label: 'Leaf B1', disabled: false }]);
    expect(result.current.hasUnavailablePropertySelected).toBe(false);
  });

  it('handleOnChange sets selected and updates dataset filters (non-empty)', () => {
    const { result } = renderHook(() => useSoilPropertiesFilters());

    act(() => {
      result.current.handleOnChange(['2', '4']);
    });

    expect(mockSetSelectedSoilProperties).toHaveBeenCalledWith(['2', '4']);

    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);
    const updater = mockSetDatasetFilters.mock.calls[0][0];
    const merged = updater();

    expect(merged).toEqual({ soil_properties: ['2', '4'] });
  });

  it('handleOnChange removes the soil_properties key when selection becomes empty', () => {
    const { result } = renderHook(() => useSoilPropertiesFilters());

    act(() => {
      result.current.handleOnChange([]);
    });

    const updater = mockSetDatasetFilters.mock.calls[0][0];
    const merged = updater({ soil_properties: ['old_selected'], min_depth: 10 });

    // The key must be gone entirely, not set to undefined: undefined keys still
    // count in the Object.keys gates on the filter payload
    expect('soil_properties' in merged).toBe(false);
    expect(merged).toEqual({ min_depth: 10 });
  });

  it('handlePillRemove uses getBranchIds and removes those ids from selection', () => {
    (getBranchIds as jest.Mock).mockReturnValue(['2', '4']);

    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      selectedSoilProperties: ['2', '3', '4'],
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    act(() => {
      result.current.handlePillRemove('3');
    });

    expect(getBranchIds as jest.Mock).toHaveBeenCalledTimes(1);
    expect((getBranchIds as jest.Mock).mock.calls[0][1]).toBe('3');

    expect(mockSetSelectedSoilProperties).toHaveBeenCalledWith(['3']);
  });

  it('handlePillRemove removes property with provided id if getBranchIds returns empty array', () => {
    (getBranchIds as jest.Mock).mockReturnValue([]);

    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      selectedSoilProperties: ['2', '3', '4'],
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    act(() => {
      result.current.handlePillRemove('3');
    });

    expect(getBranchIds as jest.Mock).toHaveBeenCalledTimes(1);
    expect((getBranchIds as jest.Mock).mock.calls[0][1]).toBe('3');

    expect(mockSetSelectedSoilProperties).toHaveBeenCalledWith(['2', '4']);
  });

  it('returns context flags and selectedSoilProperties passthrough', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      ...defaultAvailabilityState,
      isNoData: true,
      isNoFilteredData: true,
      selectedSoilProperties: ['2'],
    });

    const { result } = renderHook(() => useSoilPropertiesFilters());

    expect(result.current.isNoData).toBe(true);
    expect(result.current.isNoFilteredData).toBe(true);
    expect(result.current.selectedSoilProperties).toEqual(['2']);
  });
});
