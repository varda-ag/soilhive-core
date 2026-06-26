import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useDatasets } from './useDatasets';
import { useDeleteDatasetMutation } from './useDatasetMutation';
import { useIngestionStatus } from './useIngestionStatus';
import { useDatasetErrors } from './useDatasetErrors';
import { queryClient } from '../App';
import { ADMIN_PATHS } from '../configuration/admin';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import type { DatasetErrorItem } from 'types/datasetErrors';
import { type Dataset } from 'types/backend';

type DatasetsPublicationListType = {
  isLoading: boolean;
  datasets?: Dataset[];
  filteredDatasets: DatasetsPublicationListItem[];
  searchValue: string;
  selectedDataset: DatasetsPublicationListItem | null;
  isDeleteModalOpened: boolean;
  isErrorModalOpened: boolean;
  selectedErrorDataset: DatasetsPublicationListItem | null;
  errorsForSelectedDataset: DatasetErrorItem[];
  onEdit: (id: string) => void;
  onDelete: (dataset: DatasetsPublicationListItem) => void;
  onPublish: (id: string) => void;
  onShowErrors: (dataset: DatasetsPublicationListItem) => void;
  onDeletionConfirm: () => void;
  onDeleteModalClose: () => void;
  onErrorModalClose: () => void;
  setSearchValue: (value: string) => void;
  navigateToNewDataset: () => void;
};

export function useDatasetsPublicationList(): DatasetsPublicationListType {
  const navigate = useNavigate();
  const { datasets, isLoading } = useDatasets();
  const { datasetErrors } = useDatasetErrors();
  const [searchValue, setSearchValue] = useState<string>('');
  const [isDeleteModalOpened, setIsDeleteModalOpened] = useState<boolean>(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetsPublicationListItem | null>(null);
  const [isErrorModalOpened, setIsErrorModalOpened] = useState<boolean>(false);
  const [selectedErrorDataset, setSelectedErrorDataset] = useState<DatasetsPublicationListItem | null>(null);

  const { mutateAsync: deleteDataset, isPending: isDeleting } = useDeleteDatasetMutation();
  const { clearDatasetStatus } = useIngestionStatus();

  const onEdit = useCallback(
    (id: string) => {
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${id}`);
    },
    [navigate],
  );

  const onDelete = useCallback((dataset: DatasetsPublicationListItem) => {
    setSelectedDataset(dataset);
    setIsDeleteModalOpened(true);
  }, []);

  const onDeleteModalClose = useCallback(() => {
    setSelectedDataset(null);
    setIsDeleteModalOpened(false);
  }, []);

  const onShowErrors = useCallback((dataset: DatasetsPublicationListItem) => {
    setSelectedErrorDataset(dataset);
    setIsErrorModalOpened(true);
  }, []);

  const onErrorModalClose = useCallback(() => {
    setSelectedErrorDataset(null);
    setIsErrorModalOpened(false);
  }, []);

  const onDeletionConfirm = useCallback(async () => {
    if (!selectedDataset) {
      return;
    }
    await Promise.all([deleteDataset({ datasetId: selectedDataset.id }), clearDatasetStatus(selectedDataset.id)]);
    onDeleteModalClose();
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
  }, [deleteDataset, onDeleteModalClose, selectedDataset, clearDatasetStatus]);

  const onPublish = useCallback(
    (id: string) => {
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${id}/settings`);
    },
    [navigate],
  );

  const errorsForSelectedDataset = useMemo(
    () => datasetErrors?.find(e => e.dataset_id === selectedErrorDataset?.id)?.errors ?? [],
    [datasetErrors, selectedErrorDataset],
  );

  const datasetListItems = useMemo((): DatasetsPublicationListItem[] => {
    const errorIds = new Set(datasetErrors?.map(e => e.dataset_id) ?? []);

    const d =
      datasets?.map(dataset => ({
        id: dataset.id,
        name: dataset.name,
        status: dataset.status,
        updated_at: dataset.updated_at,
        updated_by: dataset.updated_by,
        visibility: dataset.visibility,
        hasErrors: errorIds.has(dataset.id),
      })) || [];
    return d;
  }, [datasets, datasetErrors]);

  const filteredDatasets = useMemo((): DatasetsPublicationListItem[] => {
    return datasetListItems?.filter(dataset => dataset.name.toLowerCase().includes(searchValue.toLowerCase()));
  }, [datasetListItems, searchValue]);

  const navigateToNewDataset = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/new`);
  }, [navigate]);

  return {
    datasets,
    isLoading: isLoading || isDeleting,
    searchValue,
    filteredDatasets,
    selectedDataset,
    isDeleteModalOpened,
    isErrorModalOpened,
    selectedErrorDataset,
    errorsForSelectedDataset,
    onEdit,
    onDelete,
    onPublish,
    onShowErrors,
    onDeletionConfirm,
    onDeleteModalClose,
    onErrorModalClose,
    setSearchValue,
    navigateToNewDataset,
  };
}
