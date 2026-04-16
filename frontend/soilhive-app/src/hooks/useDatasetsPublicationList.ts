import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useDatasets } from './useDatasets';
import { useDeleteDatasetMutation } from './useDatasetMutation';
import { queryClient } from '../App';
import { ADMIN_PATHS } from '../configuration/admin';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import { type Dataset } from 'types/backend';

type DatasetsPublicationListType = {
  isLoading: boolean;
  datasets?: Dataset[];
  filteredDatasets: DatasetsPublicationListItem[];
  searchValue: string;
  selectedDataset: DatasetsPublicationListItem | null;
  isDeleteModalOpened: boolean;
  onEdit: (id: string) => void;
  onDelete: (dataset: DatasetsPublicationListItem) => void;
  onPublish: (id: string) => void;
  onDeletionConfirm: () => void;
  onDeleteModalClose: () => void;
  setSearchValue: (value: string) => void;
  navigateToNewDataset: () => void;
};

export function useDatasetsPublicationList(): DatasetsPublicationListType {
  const navigate = useNavigate();
  const { datasets, isLoading, isError } = useDatasets();
  const [searchValue, setSearchValue] = useState<string>('');
  const [isDeleteModalOpened, setIsDeleteModalOpened] = useState<boolean>(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetsPublicationListItem | null>(null);

  const { mutateAsync: deleteDataset, isPending: isDeleting } = useDeleteDatasetMutation();

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

  const onDeletionConfirm = useCallback(async () => {
    if (!selectedDataset) {
      return;
    }
    await deleteDataset({ datasetId: selectedDataset.id });
    onDeleteModalClose();
    await queryClient.invalidateQueries({ queryKey: ['datasets'] });
  }, [deleteDataset, onDeleteModalClose, selectedDataset]);

  const onPublish = useCallback((id: string) => {
    console.log('onPublish', id);
  }, []);

  const datasetListItems = useMemo((): DatasetsPublicationListItem[] => {
    return (
      datasets?.map(dataset => ({
        id: dataset.id,
        name: dataset.name,
        status: dataset.status,
        visibility: dataset.visibility,
      })) || []
    );
  }, [datasets]);

  const filteredDatasets = useMemo((): DatasetsPublicationListItem[] => {
    return datasetListItems?.filter(dataset => dataset.name.toLowerCase().includes(searchValue.toLowerCase()));
  }, [datasetListItems, searchValue]);

  const navigateToNewDataset = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/new`);
  }, [navigate]);

  useEffect(() => {
    if (!isLoading && !datasets?.length && !isError) {
      navigateToNewDataset();
    }
  }, [isLoading, isError, datasets, navigateToNewDataset]);

  return {
    datasets,
    isLoading: isLoading || isDeleting,
    searchValue,
    filteredDatasets,
    selectedDataset,
    isDeleteModalOpened,
    onEdit,
    onDelete,
    onPublish,
    onDeletionConfirm,
    onDeleteModalClose,
    setSearchValue,
    navigateToNewDataset,
  };
}
