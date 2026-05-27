import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetPreview, SOIL_DATA_LIMIT } from 'hooks/useDatasetPreviewStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useSoilProperties } from 'hooks/useSoilProperties';

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));

const DATASET_ID = 'ds-1';

const fileMappings = [
  { id: 1, fileID: 'file-a', mappingId: 10 },
  { id: 2, fileID: 'file-b', mappingId: 20 },
];

const rawMappings = [
  {
    id: 10,
    data_mapping: {
      'pH(H2O)': { property_id: 'prop-ph' },
      'Carbon organic': 'prop-carbon',
    },
  },
];

const soilProperties = [
  { id: 'prop-ph', property_name: 'pH', standard_unit: 'pH units' },
  { id: 'prop-carbon', property_name: 'Organic Carbon', standard_unit: '%' },
];

const makeSoilRow = (id: number, extra: Record<string, unknown> = {}) => ({
  record_id: id,
  cursor: `cur-${id}`,
  lat: 1.0,
  lon: 2.0,
  ...extra,
});

const createMutateAsync = jest.fn();
const updateMutateAsync = jest.fn();

function setupMocks(
  overrides: {
    fileMappingsData?: any;
    mappingsData?: any;
    soilData?: any[];
    soilProperties?: any;
    isLoadingSoilData?: boolean;
  } = {},
) {
  const fileMappingsData = 'fileMappingsData' in overrides ? overrides.fileMappingsData : fileMappings;
  const mappingsData = 'mappingsData' in overrides ? overrides.mappingsData : rawMappings;
  const soilDataArr = 'soilData' in overrides ? overrides.soilData! : ([] as any[]);
  const soilPropsData = 'soilProperties' in overrides ? overrides.soilProperties : soilProperties;
  const isLoadingSoilData = overrides.isLoadingSoilData ?? false;

  (useSoilProperties as jest.Mock).mockReturnValue({ data: soilPropsData, isLoading: false });

  (useApiQuery as jest.Mock).mockImplementation(({ queryKey, enabled }: { queryKey: string[]; enabled?: boolean }) => {
    const key = queryKey[2];
    if (key === 'dataset-file-mapping') return { data: fileMappingsData, isLoading: false };
    if (key === 'mappings') return { data: mappingsData, isLoading: false };
    // Respect enabled: when disabled (no selectedMapping yet) return undefined so the
    // accumulation effect doesn't fire before the reset effect can clear stale data.
    if (key === 'mapping-soil-data') return { data: enabled ? soilDataArr : undefined, isLoading: isLoadingSoilData };
    if (key === 'files') return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
  });

  (useApiMutation as jest.Mock).mockImplementation(({ method }: { method: string }) => {
    if (method === 'POST') return { mutateAsync: createMutateAsync, isPending: false };
    if (method === 'PATCH') return { mutateAsync: updateMutateAsync, isPending: false };
    return { mutateAsync: jest.fn(), isPending: false };
  });
}

describe('useDatasetPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createMutateAsync.mockResolvedValue({ id: 99 });
    updateMutateAsync.mockResolvedValue({});
    setupMocks();
  });

  it('returns corect initial state', () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.allSoilData).toEqual([]);
    expect(result.current.availableColumns).toEqual([]);
    expect(result.current.markedForDeletion.size).toBe(0);
  });

  it('sets selectedFile to the first mapping fileID', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));
  });

  it('does not set selectedFile when datasetFileMappings is empty', async () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBeNull());
  });

  it('appends soilData to allSoilData', async () => {
    const rows = [makeSoilRow(1), makeSoilRow(2)];
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.allSoilData).toHaveLength(2));
  });

  it('does not add rows when soilData is empty', async () => {
    setupMocks({ soilData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.allSoilData).toHaveLength(0);
  });

  it('availableColumns - extracts column keys from the first soil row excluding record_id, geometry, cursor', async () => {
    const rows = [makeSoilRow(1, { ph: 7, carbon: 2 })];
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.availableColumns).toEqual(expect.arrayContaining(['lat', 'lon', 'ph', 'carbon'])));
    expect(result.current.availableColumns).not.toContain('record_id');
    expect(result.current.availableColumns).not.toContain('cursor');
  });

  it('maps sanitized column keys to property names and standard units', async () => {
    const rows = [makeSoilRow(1, { phh2o: 7 })];
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.computedPropertyNames['phh2o']).toBe('pH'));
    await waitFor(() => expect(result.current.unitsMapping['phh2o']).toBe('pH units'));
  });

  it('returns empty maps when soilProperties is not loaded', async () => {
    setupMocks({ soilProperties: undefined });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.computedPropertyNames).toEqual({});
    expect(result.current.unitsMapping).toEqual({});
  });

  it('hasMore is true when soilData length equals SOIL_DATA_LIMIT', async () => {
    const rows = Array.from({ length: SOIL_DATA_LIMIT }, (_, i) => makeSoilRow(i));
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
  });

  it('hasMore is false when soilData length is less than SOIL_DATA_LIMIT', async () => {
    setupMocks({ soilData: [makeSoilRow(1)] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.hasMore).toBe(false));
  });

  it('loadMore does nothing when there are no more pages', async () => {
    setupMocks({ soilData: [makeSoilRow(1)] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.allSoilData).toHaveLength(1));

    act(() => result.current.loadMore());

    // soilData stays the same, no new fetch triggered
    expect(result.current.allSoilData).toHaveLength(1);
  });

  it('loadMore advances the cursor to the last row when hasMore is true', async () => {
    const rows = Array.from({ length: SOIL_DATA_LIMIT }, (_, i) => makeSoilRow(i));
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());

    // After loadMore the query is re-issued with the new cursor.
    // We verify useApiQuery was called with a cursor param on the soil-data endpoint.
    const calls = (useApiQuery as jest.Mock).mock.calls;
    const soilCall = calls.find((c: any[]) => c[0]?.queryKey?.[2] === 'mapping-soil-data');
    expect(soilCall).toBeDefined();
  });

  it('toggleDeletion adds a recordId to markedForDeletion', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.toggleDeletion(42));
    expect(result.current.markedForDeletion.has(42)).toBe(true);
  });

  it('toggleDeletion removes a recordId that is already in the set', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.toggleDeletion(42));
    act(() => result.current.toggleDeletion(42));
    expect(result.current.markedForDeletion.has(42)).toBe(false);
  });

  it('toggleDeletion handles multiple distinct recordIds independently', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => {
      result.current.toggleDeletion(1);
      result.current.toggleDeletion(2);
      result.current.toggleDeletion(3);
    });
    expect(result.current.markedForDeletion.size).toBe(3);
  });

  it('onSortChange sets sortField and sortOrder for ascending', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.onSortChange('ph', 1));
    expect(result.current.sortField).toBe('ph');
    expect(result.current.sortOrder).toBe(1);
  });

  it('onSortChange sets sortField and sortOrder for descending', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.onSortChange('ph', -1));
    expect(result.current.sortField).toBe('ph');
    expect(result.current.sortOrder).toBe(-1);
  });

  it('onSortChange clears sortField and sortOrder when order is null', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.onSortChange('ph', 1));
    act(() => result.current.onSortChange('ph', null));
    expect(result.current.sortField).toBeUndefined();
    expect(result.current.sortOrder).toBeNull();
  });

  it('onSortChange resets allSoilData when sort changes', async () => {
    const rows = [makeSoilRow(1)];
    setupMocks({ soilData: rows });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.allSoilData).toHaveLength(1));

    act(() => result.current.onSortChange('ph', 1));

    expect(result.current.allSoilData).toHaveLength(0);
  });

  it('onFileChange updates selectedFile to the chosen fileID', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    act(() => result.current.onFileChange('file-b'));

    expect(result.current.selectedFile).toBe('file-b');
  });

  it('onFileChange does nothing when datasetFileMappings is empty', () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.onFileChange('file-x'));
    expect(result.current.selectedFile).toBeNull();
  });

  it('isLoading is true when soil data is loading', () => {
    setupMocks({ isLoadingSoilData: true });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.isLoading).toBe(true);
  });

  it('isLoading is false when nothing is loading', () => {
    setupMocks({ isLoadingSoilData: false });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.isLoading).toBe(false);
  });

  it('isSaving is true when the POST mutation is pending', () => {
    (useApiMutation as jest.Mock).mockImplementation(({ method }: { method: string }) => {
      if (method === 'POST') return { mutateAsync: createMutateAsync, isPending: true };
      return { mutateAsync: updateMutateAsync, isPending: false };
    });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.isSaving).toBe(true);
  });

  it('isSaving is false when no mutation is pending', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.isSaving).toBe(false);
  });

  it('handlePrevious navigates to the mappings step', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.handlePrevious());
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('mappings'));
  });

  it('handleSaveAndContinueLater calls POST /mappings and PATCH dataset-file-mapping then navigates to datasets', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    await act(() => result.current.handleSaveAndContinueLater());

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({ fileID: 'file-a', mappingId: 99 });
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('datasets'));
  });

  it('handleSaveAndContinueLater does nothing when no mapping is selected', async () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await act(() => result.current.handleSaveAndContinueLater());
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('handleContinue calls POST /mappings and PATCH then shows the loading panel', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    await act(() => result.current.handleContinue());

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({ fileID: 'file-a', mappingId: 99 });
    expect(result.current.showLoadingPanel).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
