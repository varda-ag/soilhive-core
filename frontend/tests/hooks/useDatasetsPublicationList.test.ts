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

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    getFurthestStep: jest.fn(() => 'general-info'),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  })),
}));

jest.mock('hooks/useDatasets', () => ({
  useDatasets: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useDeleteDatasetMutation: jest.fn(),
}));

jest.mock('hooks/useDatasetErrors', () => ({
  useDatasetErrors: jest.fn(() => ({ datasetErrors: [], isLoading: false })),
}));

jest.mock('../../src/App', () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

const datasets = [
  { id: '1', name: 'Carbon Dataset', gis_datatype: 'point', visibility: 'public', status: 'PENDING', updated_at: null, updated_by: null },
  {
    id: '2',
    name: 'Nitrogen Dataset',
    gis_datatype: 'polygonal',
    visibility: 'private',
    status: 'LOADED',
    updated_at: null,
    updated_by: null,
  },
  { id: '3', name: 'Soil pH', gis_datatype: 'raster', visibility: 'public', status: 'PUBLISHED', updated_at: null, updated_by: null },
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
    expect(result.current.gisDataTypeFilter).toEqual([]);
    expect(result.current.visibilityFilter).toEqual([]);
    expect(result.current.filteredDatasets).toEqual(datasets.map(d => ({ ...d, hasErrors: false })));
    expect(result.current.selectedDataset).toBeNull();
    expect(result.current.isDeleteModalOpened).toBe(false);
    expect(result.current.isErrorModalOpened).toBe(false);
    expect(result.current.selectedErrorDataset).toBeNull();
    expect(result.current.errorsForSelectedDataset).toEqual([]);
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

  describe('search filter', () => {
    it('filteredDatasets filters by searchValue case-insensitively', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setSearchValue('carbon');
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0]).toMatchObject({ id: '1', name: 'Carbon Dataset' });
    });

    it('filteredDatasets returns all datasets when searchValue is empty', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setSearchValue('');
      });

      expect(result.current.filteredDatasets).toEqual(datasets.map(d => ({ ...d, hasErrors: false })));
    });

    it('filteredDatasets returns empty array when datasets is undefined', () => {
      (useDatasets as jest.Mock).mockReturnValue({ datasets: undefined, isLoading: false });

      const { result } = renderHook(() => useDatasetsPublicationList());

      expect(result.current.filteredDatasets).toEqual([]);
    });
  });

  describe('gisDataTypeFilter', () => {
    it('exposes setGisDataTypeFilter', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      expect(typeof result.current.setGisDataTypeFilter).toBe('function');
    });

    it('returns all datasets when gisDataTypeFilter is empty', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      expect(result.current.filteredDatasets).toHaveLength(3);
    });

    it('filters datasets by a single gis_datatype', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['point'] as any);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0]).toMatchObject({ id: '1', name: 'Carbon Dataset' });
    });

    it('filters datasets by multiple gis_datatypes', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['point', 'raster'] as any);
      });

      expect(result.current.filteredDatasets).toHaveLength(2);
      expect(result.current.filteredDatasets.map(d => d.id)).toEqual(['1', '3']);
    });

    it('excludes datasets with null gis_datatype when filter is set', () => {
      (useDatasets as jest.Mock).mockReturnValue({
        datasets: [
          { id: '1', name: 'A', gis_datatype: 'point', visibility: 'public', status: 'PENDING' },
          { id: '2', name: 'B', gis_datatype: null, visibility: 'public', status: 'PENDING' },
        ],
        isLoading: false,
      });

      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['point'] as any);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0].id).toBe('1');
    });

    it('clears filter when set back to empty array', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['point'] as any);
      });

      act(() => {
        result.current.setGisDataTypeFilter([]);
      });

      expect(result.current.filteredDatasets).toHaveLength(3);
    });
  });

  describe('visibilityFilter', () => {
    it('exposes setVisibilityFilter', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      expect(typeof result.current.setVisibilityFilter).toBe('function');
    });

    it('returns all datasets when visibilityFilter is empty', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      expect(result.current.filteredDatasets).toHaveLength(3);
    });

    it('filters datasets by public visibility', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setVisibilityFilter(['public']);
      });

      expect(result.current.filteredDatasets).toHaveLength(2);
      expect(result.current.filteredDatasets.map(d => d.id)).toEqual(['1', '3']);
    });

    it('filters datasets by private visibility', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setVisibilityFilter(['private']);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0].id).toBe('2');
    });

    it('excludes datasets with null visibility when filter is set', () => {
      (useDatasets as jest.Mock).mockReturnValue({
        datasets: [
          { id: '1', name: 'A', gis_datatype: 'point', visibility: 'public', status: 'PENDING' },
          { id: '2', name: 'B', gis_datatype: 'point', visibility: null, status: 'PENDING' },
        ],
        isLoading: false,
      });

      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setVisibilityFilter(['public']);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0].id).toBe('1');
    });

    it('clears filter when set back to empty array', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setVisibilityFilter(['public']);
      });

      act(() => {
        result.current.setVisibilityFilter([]);
      });

      expect(result.current.filteredDatasets).toHaveLength(3);
    });
  });

  describe('combined filters', () => {
    it('applies search and gisDataTypeFilter simultaneously', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setSearchValue('dataset');
        result.current.setGisDataTypeFilter(['point'] as any);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0]).toMatchObject({ id: '1', name: 'Carbon Dataset' });
    });

    it('applies gisDataTypeFilter and visibilityFilter simultaneously', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['point', 'polygonal'] as any);
        result.current.setVisibilityFilter(['public']);
      });

      expect(result.current.filteredDatasets).toHaveLength(1);
      expect(result.current.filteredDatasets[0]).toMatchObject({ id: '1', name: 'Carbon Dataset' });
    });

    it('returns empty array when no datasets match combined filters', () => {
      const { result } = renderHook(() => useDatasetsPublicationList());

      act(() => {
        result.current.setGisDataTypeFilter(['raster'] as any);
        result.current.setVisibilityFilter(['private']);
      });

      expect(result.current.filteredDatasets).toHaveLength(0);
    });
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

  it('onPublish navigates to the dataset settings page', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.onPublish('1');
    });

    expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.DATASETS}/edit/1/settings`);
  });

  it('navigateToNewDataset navigates to the new dataset page', () => {
    const { result } = renderHook(() => useDatasetsPublicationList());

    act(() => {
      result.current.navigateToNewDataset();
    });

    expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.DATASETS}/new`);
  });

  it('filteredDatasets maps updated_by from dataset', () => {
    (useDatasets as jest.Mock).mockReturnValue({
      datasets: [{ id: '1', name: 'Carbon Dataset', updated_by: 'user-uuid-123' }],
      isLoading: false,
    });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.filteredDatasets[0].updated_by).toBe('user-uuid-123');
  });

  it('filteredDatasets carries updated_by as null when dataset has null updated_by', () => {
    (useDatasets as jest.Mock).mockReturnValue({
      datasets: [{ id: '1', name: 'Carbon Dataset', updated_by: null }],
      isLoading: false,
    });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.filteredDatasets[0].updated_by).toBeNull();
  });

  it('filteredDatasets carries updated_by as undefined when dataset has no updated_by', () => {
    (useDatasets as jest.Mock).mockReturnValue({
      datasets: [{ id: '1', name: 'Carbon Dataset' }],
      isLoading: false,
    });

    const { result } = renderHook(() => useDatasetsPublicationList());

    expect(result.current.filteredDatasets[0].updated_by).toBeUndefined();
  });
});
