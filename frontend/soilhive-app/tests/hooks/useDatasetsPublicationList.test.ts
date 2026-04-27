import { act, renderHook } from '@testing-library/react';
import { useNavigate } from 'react-router';

import { useDatasetsPublicationList } from 'hooks/useDatasetsPublicationList';
import { useDatasets } from 'hooks/useDatasets';
import { useDeleteDatasetMutation } from 'hooks/useDatasetMutation';
import { queryClient } from '../../src/App';
import { ADMIN_PATHS } from '../../src/configuration/admin';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useDatasets', () => ({
  useDatasets: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useDeleteDatasetMutation: jest.fn(),
}));

jest.mock('../../src/App', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

const datasets = [
  { id: '1', name: 'Carbon Dataset' },
  { id: '2', name: 'Nitrogen Dataset' },
  { id: '3', name: 'Soil pH' },
];

describe('useDatasetsPublicationList', () => {
  const navigate = jest.fn();
  const deleteDataset = jest.fn();

  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    (useDatasets as jest.Mock).mockReturnValue({ datasets, isLoading: false });
    (useDeleteDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync: deleteDataset, isPending: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns initial state correctly', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.searchValue).toBe('');
    expect(result.current.filteredDatasets).toEqual(datasets);
    expect(result.current.selectedDataset).toBeNull();
    expect(result.current.isDeleteModalOpened).toBe(false);
  });

  it('isLoading is true when useDatasets is loading', () => {
    (useDatasets as jest.Mock).mockReturnValue({ datasets: undefined, isLoading: true });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.isLoading).toBe(true);
  });

  it('isLoading is true when delete mutation is pending', () => {
    (useDeleteDatasetMutation as jest.Mock).mockReturnValue({ mutateAsync: deleteDataset, isPending: true });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.isLoading).toBe(true);
  });

  it('filteredDatasets filters by searchValue case-insensitively', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.setSearchValue('carbon');
    });

    expect(result.current.filteredDatasets).toEqual([{ id: '1', name: 'Carbon Dataset' }]);
  });

  it('filteredDatasets returns all datasets when searchValue is empty', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.setSearchValue('');
    });

    expect(result.current.filteredDatasets).toEqual(datasets);
  });

  it('filteredDatasets returns empty array when datasets is undefined', () => {
    (useDatasets as jest.Mock).mockReturnValue({ datasets: undefined, isLoading: false });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.filteredDatasets).toEqual([]);
  });

  it('onEdit navigates to the edit page for the given id', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onEdit('1');
    });

    expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.DATASETS}/edit/1`);
  });

  it('onDelete sets selectedDataset and opens the delete modal', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onDelete(datasets[0] as any);
    });

    expect(result.current.selectedDataset).toEqual(datasets[0]);
    expect(result.current.isDeleteModalOpened).toBe(true);
  });

  it('onDeleteModalClose clears selectedDataset and closes the modal', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onDelete(datasets[0] as any);
    });

    act(() => {
      result.current.onDeleteModalClose();
    });

    expect(result.current.selectedDataset).toBeNull();
    expect(result.current.isDeleteModalOpened).toBe(false);
  });

  it('onDeletionConfirm does nothing when selectedDataset is null', async () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    await act(async () => {
      await result.current.onDeletionConfirm();
    });

    expect(deleteDataset).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('onDeletionConfirm deletes the dataset, closes the modal and invalidates queries', async () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onDelete(datasets[1] as any);
    });

    await act(async () => {
      await result.current.onDeletionConfirm();
    });

    expect(deleteDataset).toHaveBeenCalledWith({ datasetId: '2' });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['datasets'] });
    expect(result.current.isDeleteModalOpened).toBe(false);
    expect(result.current.selectedDataset).toBeNull();
  });

  it('onPublish calls console.log with the dataset id', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onPublish('1');
    });

    expect(consoleSpy).toHaveBeenCalledWith('onPublish', '1');
    consoleSpy.mockRestore();
  });

  it('navigateToNewDataset navigates to the new dataset page', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.navigateToNewDataset();
    });

    expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.DATASETS}/new`);
  });
});
