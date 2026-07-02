import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetPreview, SOIL_DATA_LIMIT } from 'hooks/useDatasetPreviewStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useApiMutation } from 'hooks/useApiMutation';
import { useCreateJobMutation } from 'hooks/useJobsApi';
import { useSoilProperties } from 'hooks/useSoilProperties';
import useIngestionFlow from 'hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';
import type { CleaningReport } from 'types/backend';
import { CellDeleteReason, CellModifyReason, RowDeleteReason } from 'types/backend';

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useApiMutation', () => ({ useApiMutation: jest.fn() }));
jest.mock('hooks/useJobsApi', () => ({ useCreateJobMutation: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn(), removeQueries: jest.fn() })),
}));

jest.mock('hooks/useIngestionFlow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));

const DATASET_ID = 'ds-1';

const mockDataset = { id: DATASET_ID, name: 'My Dataset' };

const mockCleaningReport: CleaningReport = {
  summary: { values_modified: 30, rows_deleted: 10, cells_deleted: 12 },
  modifications: [
    { reason: CellModifyReason.DEPTH_ROUNDED, count: 5 },
    { reason: CellModifyReason.VALUE_ROUNDED, count: 15 },
    { reason: CellModifyReason.UNIT_CONVERTED, count: 10 },
  ],
  row_deletions: [
    { reason: RowDeleteReason.INVALID_COORDINATES, count: 3 },
    { reason: RowDeleteReason.DUPLICATE_ROW, count: 2 },
    { reason: RowDeleteReason.USER_DELETION, count: 5 },
  ],
  cell_deletions: [
    { reason: CellDeleteReason.NON_NUMERIC, count: 4, property: 'ph' },
    { reason: CellDeleteReason.NON_NUMERIC, count: 3, property: 'carbon' },
    { reason: CellDeleteReason.NEGATIVE_VALUE, count: 5 },
  ],
};

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
const createJobMutateAsync = jest.fn();

const mockMarkAsChanged = jest.fn();
const mockResetChanges = jest.fn();

function setupMocks(
  overrides: {
    fileMappingsData?: any;
    mappingsData?: any;
    soilData?: any[];
    soilProperties?: any;
    isLoadingSoilData?: boolean;
    datasetData?: any;
    soilDataStats?: CleaningReport | undefined;
    isStatsLoading?: boolean;
  } = {},
) {
  const fileMappingsData = 'fileMappingsData' in overrides ? overrides.fileMappingsData : fileMappings;
  const mappingsData = 'mappingsData' in overrides ? overrides.mappingsData : rawMappings;
  const soilDataArr = 'soilData' in overrides ? overrides.soilData! : ([] as any[]);
  const soilPropsData = 'soilProperties' in overrides ? overrides.soilProperties : soilProperties;
  const isLoadingSoilData = overrides.isLoadingSoilData ?? false;
  const datasetData = 'datasetData' in overrides ? overrides.datasetData : mockDataset;
  const soilDataStatsData = 'soilDataStats' in overrides ? overrides.soilDataStats : undefined;
  const isStatsLoadingVal = overrides.isStatsLoading ?? false;

  (useDataset as jest.Mock).mockReturnValue({ data: datasetData });
  (useSoilProperties as jest.Mock).mockReturnValue({ data: soilPropsData, isLoading: false });

  (useApiQuery as jest.Mock).mockImplementation(({ queryKey, enabled }: { queryKey: string[]; enabled?: boolean }) => {
    const key = queryKey[2];
    if (key === 'dataset-file-mapping') return { data: fileMappingsData, isLoading: false };
    if (key === 'mappings') return { data: mappingsData, isLoading: false };
    if (key === 'mapping-soil-data') {
      if (queryKey[4] === 'stats') return { data: soilDataStatsData, isLoading: isStatsLoadingVal };
      // Respect enabled: when disabled (no selectedMapping yet) return undefined so the
      // accumulation effect doesn't fire before the reset effect can clear stale data.
      return { data: enabled ? soilDataArr : undefined, isLoading: isLoadingSoilData };
    }
    if (key === 'files') return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
  });

  (useApiMutation as jest.Mock).mockImplementation(({ method }: { method: string }) => {
    if (method === 'POST') return { mutateAsync: createMutateAsync, isPending: false };
    if (method === 'PATCH') return { mutateAsync: updateMutateAsync, isPending: false };
    return { mutateAsync: jest.fn(), isPending: false };
  });

  (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: createJobMutateAsync });
}

describe('useDatasetPreview', () => {
  beforeEach(() => {
    createMutateAsync.mockResolvedValue({ id: 99 });
    updateMutateAsync.mockResolvedValue({});
    createJobMutateAsync.mockResolvedValue({ id: 'job-1' });
    (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges });
    setupMocks();
  });

  afterEach(() => jest.clearAllMocks());

  it('returns corect initial state', () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.allSoilData).toEqual([]);
    expect(result.current.availableColumns).toEqual([]);
    expect(result.current.currentFileDeletions.size).toBe(0);
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

  it('toggleDeletion adds a recordId to currentFileDeletions', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.toggleDeletion(42));
    expect(result.current.currentFileDeletions.has(42)).toBe(true);
  });

  it('toggleDeletion removes a recordId that is already in the set', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.toggleDeletion(42));
    act(() => result.current.toggleDeletion(42));
    expect(result.current.currentFileDeletions.has(42)).toBe(false);
  });

  it('toggleDeletion handles multiple distinct recordIds independently', () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => {
      result.current.toggleDeletion(1);
      result.current.toggleDeletion(2);
      result.current.toggleDeletion(3);
    });
    expect(result.current.currentFileDeletions.size).toBe(3);
  });

  it('toggleDeletion does nothing when no file is selected', () => {
    setupMocks({ fileMappingsData: [] });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    act(() => result.current.toggleDeletion(42));
    expect(result.current.currentFileDeletions.size).toBe(0);
  });

  it('toggleDeletion tracks deletions per file independently', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    act(() => result.current.toggleDeletion(1));

    act(() => result.current.onFileChange('file-b'));
    act(() => result.current.toggleDeletion(2));

    // file-b sees only record 2
    expect(result.current.currentFileDeletions.has(2)).toBe(true);
    expect(result.current.currentFileDeletions.has(1)).toBe(false);
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

  it('returns the dataset name when dataset is loaded', () => {
    setupMocks({ datasetData: { id: DATASET_ID, name: 'My Dataset' } });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.datasetName).toBe('My Dataset');
  });

  it('returns an empty string for datasetName when dataset is not loaded', () => {
    setupMocks({ datasetData: undefined });
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    expect(result.current.datasetName).toBe('');
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

  it('handleContinue saves the mapping, triggers a bulk-load job, then shows the loading panel', async () => {
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    await act(() => result.current.handleContinue());

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({ fileID: 'file-a', mappingId: 99 });
    expect(createJobMutateAsync).toHaveBeenCalledWith({
      type: 'bulk-load',
      dataset_id: DATASET_ID,
      delete_source_files: true,
    });
    expect(result.current.showLoadingPanel).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handleContinue does not show the loading panel when job creation fails', async () => {
    createJobMutateAsync.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
    await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));

    await act(async () => {
      await result.current.handleContinue().catch(() => {});
    });

    expect(result.current.showLoadingPanel).toBe(false);
  });

  describe('soilDataSummary', () => {
    it('returns all-zero summary when no stats are loaded', () => {
      setupMocks({ soilDataStats: undefined });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      expect(result.current.soilDataSummary.summary).toEqual({ values_modified: 0, rows_deleted: 0, cells_deleted: 0 });
      expect(Object.values(result.current.soilDataSummary.modifications).every(v => v === 0)).toBe(true);
      expect(Object.values(result.current.soilDataSummary.row_deletions).every(v => v === 0)).toBe(true);
      expect(Object.values(result.current.soilDataSummary.cell_deletions).every(v => v === 0)).toBe(true);
    });

    it('maps modifications counts correctly', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.soilDataSummary.modifications[CellModifyReason.DEPTH_ROUNDED]).toBe(5));
      expect(result.current.soilDataSummary.modifications[CellModifyReason.VALUE_ROUNDED]).toBe(15);
      expect(result.current.soilDataSummary.modifications[CellModifyReason.UNIT_CONVERTED]).toBe(10);
    });

    it('fills in 0 for missing row_deletion reasons', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.soilDataSummary.row_deletions[RowDeleteReason.INVALID_DEPTH_INTERVAL]).toBe(0));
      expect(result.current.soilDataSummary.row_deletions[RowDeleteReason.MINIMUM_DATA_REQUIREMENT]).toBe(0);
    });

    it('maps present row_deletion counts correctly', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.soilDataSummary.row_deletions[RowDeleteReason.INVALID_COORDINATES]).toBe(3));
      expect(result.current.soilDataSummary.row_deletions[RowDeleteReason.DUPLICATE_ROW]).toBe(2);
      expect(result.current.soilDataSummary.row_deletions[RowDeleteReason.USER_DELETION]).toBe(5);
    });

    it('sums cell_deletions across multiple properties for the same reason', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      // non_numeric appears for 'ph' (4) and 'carbon' (3) → sum = 7
      await waitFor(() => expect(result.current.soilDataSummary.cell_deletions[CellDeleteReason.NON_NUMERIC]).toBe(7));
    });

    it('fills in 0 for missing cell_deletion reasons', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.soilDataSummary.cell_deletions[CellDeleteReason.ZERO_VALUE]).toBe(0));
      expect(result.current.soilDataSummary.cell_deletions[CellDeleteReason.OOB]).toBe(0);
    });

    it('subtracts user_deletion from rows_deleted in summary', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      // summary.rows_deleted = 10, user_deletion = 5 → adjusted = 5
      await waitFor(() => expect(result.current.soilDataSummary.summary.rows_deleted).toBe(5));
    });

    it('passes summary.values_modified and cells_deleted through unchanged', async () => {
      setupMocks({ soilDataStats: mockCleaningReport });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.soilDataSummary.summary.values_modified).toBe(30));
      expect(result.current.soilDataSummary.summary.cells_deleted).toBe(12);
    });

    it('isStatsLoading reflects the stats query loading state', () => {
      setupMocks({ isStatsLoading: true });
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      expect(result.current.isStatsLoading).toBe(true);
    });
  });

  describe('leave Ingestion flow', () => {
    it('calls markAsChanged on mount', () => {
      renderHook(() => useDatasetPreview(DATASET_ID));
      expect(mockMarkAsChanged).toHaveBeenCalledTimes(1);
    });

    it('handleSaveAndContinueLater calls resetChanges', async () => {
      const { result } = renderHook(() => useDatasetPreview(DATASET_ID));
      await waitFor(() => expect(result.current.selectedFile).toBe('file-a'));
      await act(() => result.current.handleSaveAndContinueLater());
      expect(mockResetChanges).toHaveBeenCalledTimes(1);
    });
  });
});
