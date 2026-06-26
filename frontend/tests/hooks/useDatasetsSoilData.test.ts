import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetsSoilData } from 'hooks/useDatasetsSoilData';
import { useFileManagement } from 'hooks/useFileManagement';
import { useApiQuery } from 'hooks/useApiQuery';
import { useCreateDatasetFileMapping } from 'hooks/useDatasetMutation';
import useIngestionFlow from 'hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';

// --- Module mocks -----------------------------------------------------------

jest.mock('react-router', () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: 'dataset-123' }),
}));

jest.mock('hooks/useFileManagement', () => ({
  useFileManagement: jest.fn(),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useCreateDatasetFileMapping: jest.fn(),
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    getFurthestStep: jest.fn(() => 'general-info'),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  })),
}));

jest.mock('hooks/useFileUpload', () => ({
  useFileUpload: jest.fn(() => ({
    fileInputRef: { current: null },
    uploadingFiles: [],
    uploadProgress: {},
    uploadErrors: [],
    handleFiles: jest.fn(),
  })),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(() => ({ request: jest.fn() })),
}));

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'http://mocked-backend',
}));

jest.mock('hooks/useIngestionFlow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));

const mockMarkAsChanged = jest.fn();
const mockResetChanges = jest.fn();

// --- Helpers ----------------------------------------------------------------

const useFileManagementMock = useFileManagement as jest.MockedFunction<typeof useFileManagement>;
const useApiQueryMock = useApiQuery as jest.MockedFunction<typeof useApiQuery>;
const useCreateDatasetFileMappingMock = useCreateDatasetFileMapping as jest.MockedFunction<typeof useCreateDatasetFileMapping>;

function buildDefaultMocks(overrides: { deleteFileAndMapping?: jest.Mock; existingFiles?: any[] } = {}) {
  const deleteFileAndMapping = overrides.deleteFileAndMapping ?? jest.fn().mockResolvedValue(undefined);

  useFileManagementMock.mockReturnValue({ deleteFileAndMapping });
  useCreateDatasetFileMappingMock.mockReturnValue({ mutateAsync: jest.fn() } as any);

  // useApiQuery is called twice in the hook: once for /epsg and once for /datasets/.../files.
  const epsgResult = { data: [], isLoading: false };
  const filesResult = { data: overrides.existingFiles ?? [], isLoading: false };
  useApiQueryMock.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint === '/epsg') return epsgResult as any;
    return filesResult as any;
  });
}

function buildSoilDataFile(id: string, name: string, crs: string | null = 'EPSG:4326', error?: string, fieldNames?: string[]) {
  return { id, file: null, name, crs, inferredCrs: undefined, fieldNames, progress: 100, error };
}

// ---------------------------------------------------------------------------

describe('useDatasetsSoilData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges });
    (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset' } });
  });

  // --- isContinueEnabled ---------------------------------------------------

  describe('isContinueEnabled', () => {
    it('is false when there are no files', () => {
      buildDefaultMocks();
      const { result } = renderHook(() => useDatasetsSoilData());
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when at least one file is missing a crs', () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: {} },
          { id: '2', name: 'b.csv', metadata: {} },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      // both files land with crs: null (no user selection yet)
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is true when all files have an inferredCrs (but no user-set crs)', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326 } },
          { id: '2', name: 'b.csv', metadata: { epsg: 27700 } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.isContinueEnabled).toBe(true);
      });
    });

    it('is true when all files have a crs and no errors', async () => {
      buildDefaultMocks();
      const { result } = renderHook(() => useDatasetsSoilData());

      act(() => {
        const { useFileUpload } = jest.requireMock('hooks/useFileUpload');
        const onFileUploaded = useFileUpload.mock.calls[0][0];
        onFileUploaded(buildSoilDataFile('1', 'a.csv', 'EPSG:4326'));
        onFileUploaded(buildSoilDataFile('2', 'b.csv', 'EPSG:27700'));
      });

      await waitFor(() => {
        expect(result.current.isContinueEnabled).toBe(true);
      });
    });

    it('is false when files have mismatched fieldNames even if all have a crs', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col1', 'col3'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.isContinueEnabled).toBe(false);
      });
    });
  });

  // --- consistency error annotation ----------------------------------------

  describe('structure inconsistency errors', () => {
    it('sets error on files whose fieldNames differ from the first file', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col1', 'col3'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles[0].error).toBeNull();
        expect(result.current.soilDataFiles[1].error).toBeTruthy();
      });
    });

    it('sets no error when all files have matching fieldNames', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col2', 'col1'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles.every(f => !f.error)).toBe(true);
      });
    });

    it('sets no error on a single file (no master comparison possible)', async () => {
      buildDefaultMocks({
        existingFiles: [{ id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } }],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles[0].error).toBeNull();
      });
    });

    it('does not set error when a file has no fieldNames yet', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326 } }, // no field_names
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles[1].error).toBeNull();
      });
    });

    it('populates missingFields and extraFields on inconsistent files', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2', 'col3'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col1', 'col4'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        const file = result.current.soilDataFiles[1];
        expect(file.missingFields).toEqual(expect.arrayContaining(['col2', 'col3']));
        expect(file.extraFields).toEqual(['col4']);
      });
    });

    it('clears missingFields and extraFields on consistent files', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col2', 'col1'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles[1].missingFields).toBeUndefined();
        expect(result.current.soilDataFiles[1].extraFields).toBeUndefined();
      });
    });

    it('re-evaluates errors when the master file is removed', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: '1', name: 'a.csv', metadata: { epsg: 4326, field_names: ['col1', 'col2'] } },
          { id: '2', name: 'b.csv', metadata: { epsg: 4326, field_names: ['col1', 'col3'] } },
          { id: '3', name: 'c.csv', metadata: { epsg: 4326, field_names: ['col1', 'col3'] } },
        ],
      });
      const { result } = renderHook(() => useDatasetsSoilData());

      // Initially file '2' and '3' are inconsistent with master '1'
      await waitFor(() => {
        expect(result.current.soilDataFiles[1].error).toBeTruthy();
        expect(result.current.soilDataFiles[2].error).toBeTruthy();
      });

      // Remove the master; '2' becomes the new master, '3' matches it → no errors
      await act(async () => {
        await result.current.removeFile('1');
      });

      await waitFor(() => {
        expect(result.current.soilDataFiles).toHaveLength(2);
        expect(result.current.soilDataFiles[0].error).toBeNull(); // new master
        expect(result.current.soilDataFiles[1].error).toBeNull(); // matches new master
      });
    });
  });

  // --- useEffect (existing files) ------------------------------------------

  describe('when existing files are loaded from the backend', () => {
    it('maps FileDescriptor[] into SoilDataFile[] with the correct shape', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: 'f1', name: 'soil.csv', metadata: { epsg: 4326, field_names: ['lat', 'lon'] } },
          { id: 'f2', name: 'geo.geojson', metadata: {} },
        ],
      });

      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles).toEqual([
          {
            id: 'f1',
            file: null,
            name: 'soil.csv',
            crs: null,
            inferredCrs: 'EPSG:4326',
            fieldNames: ['lat', 'lon'],
            progress: 100,
            error: null,
          },
          {
            id: 'f2',
            file: null,
            name: 'geo.geojson',
            crs: null,
            inferredCrs: undefined,
            fieldNames: undefined,
            progress: 100,
            error: null,
          },
        ]);
      });
    });

    it('filters out null entries from the backend response', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: 'f1', name: 'soil.csv', metadata: {} },
          null, // backend sometimes returns nulls
        ],
      });

      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles).toHaveLength(1);
        expect(result.current.soilDataFiles[0].id).toBe('f1');
      });
    });
  });

  // --- clearAll ------------------------------------------------------------

  describe('clearAll', () => {
    it('removes all successfully deleted files from the UI', async () => {
      const deleteFileAndMapping = jest.fn().mockResolvedValue(undefined);
      buildDefaultMocks({ deleteFileAndMapping });
      const { result } = renderHook(() => useDatasetsSoilData());

      act(() => {
        const { useFileUpload } = jest.requireMock('hooks/useFileUpload');
        const onFileUploaded = useFileUpload.mock.calls[0][0];
        onFileUploaded(buildSoilDataFile('1', 'a.csv'));
        onFileUploaded(buildSoilDataFile('2', 'b.csv'));
      });

      await act(async () => {
        await result.current.clearAll();
      });

      expect(deleteFileAndMapping).toHaveBeenCalledTimes(2);
      expect(result.current.soilDataFiles).toHaveLength(0);
    });

    it('keeps files in the UI whose deletion failed', async () => {
      const deleteFileAndMapping = jest
        .fn()
        .mockResolvedValueOnce(undefined) // file '1' succeeds
        .mockRejectedValueOnce(new Error('server error')); // file '2' fails

      buildDefaultMocks({ deleteFileAndMapping });
      const { result } = renderHook(() => useDatasetsSoilData());

      act(() => {
        const { useFileUpload } = jest.requireMock('hooks/useFileUpload');
        const onFileUploaded = useFileUpload.mock.calls[0][0];
        onFileUploaded(buildSoilDataFile('1', 'a.csv'));
        onFileUploaded(buildSoilDataFile('2', 'b.csv'));
      });

      await act(async () => {
        await result.current.clearAll();
      });

      // only file '2' should remain since its deletion failed
      await waitFor(() => {
        expect(result.current.soilDataFiles).toHaveLength(1);
        expect(result.current.soilDataFiles[0].id).toBe('2');
      });
    });
  });

  describe('leave Ingestion flow', () => {
    it('calls markAsChanged on mount', () => {
      buildDefaultMocks();
      renderHook(() => useDatasetsSoilData());
      expect(mockMarkAsChanged).toHaveBeenCalledTimes(1);
    });

    it('handleSaveAndContinueLater calls resetChanges', async () => {
      buildDefaultMocks();
      const { result } = renderHook(() => useDatasetsSoilData());
      await act(async () => result.current.handleSaveAndContinueLater());
      expect(mockResetChanges).toHaveBeenCalledTimes(1);
    });
  });
});
