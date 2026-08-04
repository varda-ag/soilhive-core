import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useDatasetIngestionState } from 'hooks/useDatasetIngestionState';
import { useApiQuery } from 'hooks/useApiQuery';
import { useJobsQueries } from 'hooks/useJobsApi';
import useIngestionFlow from 'hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useCreateProcedureMutation', () => ({
  useCreateProcedureMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useCreateMappingsMutation', () => ({
  useCreateMappingsMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    updateFurthestStep: jest.fn(),
  })),
}));

jest.mock('hooks/useIngestionFlow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useUpdateDatasetFileMappingMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useJobsApi', () => ({
  useCreateJobMutation: jest.fn(() => ({ mutateAsync: jest.fn().mockResolvedValue({ id: 'job-1' }) })),
  useJobsQueries: jest.fn(() => []),
}));

const mockQueryClient = { invalidateQueries: jest.fn().mockResolvedValue(undefined) };

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => mockQueryClient),
}));

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));

const mockUseApiQuery = useApiQuery as jest.Mock;
const mockMarkAsChanged = jest.fn();
const mockResetChanges = jest.fn();
const mockNavigate = jest.fn();

beforeEach(() => {
  mockNavigate.mockClear();
  mockMarkAsChanged.mockClear();
  (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false });
  (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges, isRaster: false });
  (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset' } });
  (useJobsQueries as jest.Mock).mockReturnValue([]);
});

describe('useDatasetIngestionState', () => {
  it('calls markAsChanged on mount', () => {
    renderHook(() => useDatasetIngestionState('1'));
    expect(mockMarkAsChanged).toHaveBeenCalled();
  });

  it('exposes the dataset name and gis_datatype', () => {
    (useDataset as jest.Mock).mockReturnValue({ data: { name: 'My dataset', gis_datatype: 'raster' } });
    const { result } = renderHook(() => useDatasetIngestionState('1'));
    expect(result.current.datasetName).toBe('My dataset');
    expect(result.current.datasetGisDataType).toBe('raster');
  });

  describe('expandedRows / toggleRow', () => {
    it('starts with no expanded rows and toggles a column name in/out', () => {
      const { result } = renderHook(() => useDatasetIngestionState('1'));
      expect(result.current.expandedRows.size).toBe(0);

      act(() => {
        result.current.toggleRow('col1');
      });
      expect(result.current.expandedRows.has('col1')).toBe(true);

      act(() => {
        result.current.toggleRow('col1');
      });
      expect(result.current.expandedRows.has('col1')).toBe(false);
    });
  });

  describe('handlePrevious', () => {
    it('navigates to the soil-data step for the dataset', () => {
      const { result } = renderHook(() => useDatasetIngestionState('42'));
      act(() => {
        result.current.handlePrevious();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/soil-data');
    });
  });

  describe('saveAndContinueLater', () => {
    it('awaits the given save callback, then navigates to the datasets list', async () => {
      const save = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useDatasetIngestionState('42'));
      await act(async () => {
        await result.current.saveAndContinueLater(save);
      });
      expect(save).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets');
    });
  });

  describe('isImporting / allFilesStaged', () => {
    it('is false when no file is ONGOING', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'PENDING' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useDatasetIngestionState('42'));
      expect(result.current.isImporting).toBe(false);
      expect(result.current.allFilesStaged).toBe(false);
    });

    it('is true when at least one file has ONGOING status', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'ONGOING' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useDatasetIngestionState('42'));
      expect(result.current.isImporting).toBe(true);
    });

    it('marks allFilesStaged true when every file is STAGED', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'STAGED' }, { status: 'STAGED' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useDatasetIngestionState('42'));
      expect(result.current.allFilesStaged).toBe(true);
    });
  });

  describe('job-polling completion effect', () => {
    it('sets showLoadingPanel and does not navigate when isRaster is true and all jobs complete', async () => {
      (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges, isRaster: true });
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'PENDING' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
      const { result } = renderHook(() => useDatasetIngestionState('42'));

      act(() => {
        result.current.setIsImportingState(true);
        result.current.setActiveJobIds(['job-1']);
      });

      expect(result.current.showLoadingPanel).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('/preview'));
    });

    it('navigates to preview and leaves showLoadingPanel false when isRaster is false and all jobs complete', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'PENDING' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
      const { result } = renderHook(() => useDatasetIngestionState('42'));

      act(() => {
        result.current.setIsImportingState(true);
        result.current.setActiveJobIds(['job-1']);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
      expect(result.current.showLoadingPanel).toBe(false);
    });

    it('resets importing state without navigating when a job fails', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: [{ status: 'PENDING' }], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'failed' } })));
      const { result } = renderHook(() => useDatasetIngestionState('42'));

      act(() => {
        result.current.setIsImportingState(true);
        result.current.setActiveJobIds(['job-1']);
      });

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(result.current.isImportingState).toBe(false);
    });
  });
});
