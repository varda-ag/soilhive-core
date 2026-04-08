import { renderHook, act, waitFor } from '@testing-library/react';
import { useDatasetsSoilData } from 'hooks/useDatasetsSoilData';
import { useFileManagement } from 'hooks/useFileManagement';
import { useApiQuery } from 'hooks/useApiQuery';
import { useCreateDatasetFileMapping } from 'hooks/useDatasetMutation';

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

jest.mock('hooks/useFileUpload', () => ({
  useFileUpload: jest.fn(() => ({
    fileInputRef: { current: null },
    uploadingFiles: [],
    uploadProgress: {},
    uploadErrors: [],
    handleFiles: jest.fn(),
  })),
}));

jest.mock('../../src/api-client', () => ({
  useRequest: jest.fn(() => ({ request: jest.fn() })),
}));

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'http://mocked-backend',
}));

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

function buildSoilDataFile(id: string, name: string, crs: string | null = 'EPSG:4326', error?: string) {
  return { id, file: null, name, crs, inferredCrs: undefined, progress: 100, error };
}

// ---------------------------------------------------------------------------

describe('useDatasetsSoilData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  // --- useEffect (existing files) ------------------------------------------

  describe('when existing files are loaded from the backend', () => {
    it('maps FileDescriptor[] into SoilDataFile[] with the correct shape', async () => {
      buildDefaultMocks({
        existingFiles: [
          { id: 'f1', name: 'soil.csv', metadata: { epsg: 4326 } },
          { id: 'f2', name: 'geo.geojson', metadata: {} },
        ],
      });

      const { result } = renderHook(() => useDatasetsSoilData());

      await waitFor(() => {
        expect(result.current.soilDataFiles).toEqual([
          { id: 'f1', file: null, name: 'soil.csv', crs: null, inferredCrs: 'EPSG:4326', progress: 100 },
          { id: 'f2', file: null, name: 'geo.geojson', crs: null, inferredCrs: undefined, progress: 100 },
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
});
