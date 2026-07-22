import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MultiSelect } from 'primereact/multiselect';

import PlusIcon from 'assets/icons/small-plus-icon.svg?react';
import { Button, Loader, TextInput } from 'components/UI';
import { useDatasetsPublicationList } from 'hooks/useDatasetsPublicationList';
import { DatasetsPublicationTable } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsPublicationTable';
import { DatasetDeleteModal } from 'components/AdminPortal/DatasetDeleteModal/DatasetDeleteModal';
import { DatasetErrorModal } from 'components/AdminPortal/DatasetErrorModal/DatasetErrorModal';
import { GISDataType } from 'types/backend';

import styles from './DatasetsPublication.module.scss';

export function DatasetsPublication() {
  const { t } = useTranslation('admin');

  const {
    isLoading,
    filteredDatasets,
    searchValue,
    gisDataTypeFilter,
    visibilityFilter,
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
    setGisDataTypeFilter,
    setVisibilityFilter,
    navigateToNewDataset,
  } = useDatasetsPublicationList();

  const gisDataTypeOptions = useMemo(
    () => [
      { label: t('datasets.list.filter_options.point'), value: GISDataType.POINT },
      { label: t('datasets.list.filter_options.polygonal'), value: GISDataType.POLYGONAL },
      { label: t('datasets.list.filter_options.raster'), value: GISDataType.RASTER },
    ],
    [t],
  );

  const visibilityOptions = useMemo(
    () => [
      { label: t('datasets.list.filter_options.public'), value: 'public' },
      { label: t('datasets.list.filter_options.private'), value: 'private' },
    ],
    [t],
  );

  return (
    <div className={styles.DatasetsPublication}>
      <div className={styles.Wrapper}>
        {isLoading && <Loader />}
        {!isLoading && (
          <>
            <div className={styles.Actions}>
              <div className={styles.Filters}>
                <TextInput
                  className={styles.Search}
                  size="small"
                  value={searchValue}
                  placeholder={t('datasets.list.search_placeholder')}
                  isSearch={true}
                  isClearable
                  onChange={setSearchValue}
                />
                <MultiSelect
                  className={styles.DropdownType}
                  panelClassName={styles.DropdownPanel}
                  value={gisDataTypeFilter}
                  onChange={e => setGisDataTypeFilter(e.value)}
                  options={gisDataTypeOptions}
                  placeholder={t('datasets.list.filter_by_type')}
                  showSelectAll={false}
                />
                <MultiSelect
                  className={styles.DropdownVisibility}
                  panelClassName={styles.DropdownPanel}
                  value={visibilityFilter}
                  onChange={e => setVisibilityFilter(e.value)}
                  options={visibilityOptions}
                  placeholder={t('datasets.list.filter_by_visibility')}
                  showSelectAll={false}
                />
              </div>
              <Button onClick={navigateToNewDataset}>
                <PlusIcon /> {t('datasets.list.add_button_text')}
              </Button>
            </div>
            <DatasetsPublicationTable
              datasets={filteredDatasets}
              isSearch={!!searchValue}
              onEdit={onEdit}
              onDelete={onDelete}
              onPublish={onPublish}
              onShowErrors={onShowErrors}
            />
            <DatasetDeleteModal
              visible={isDeleteModalOpened}
              datasetName={selectedDataset?.name}
              onContinue={onDeletionConfirm}
              onCancel={onDeleteModalClose}
            />
            <DatasetErrorModal
              visible={isErrorModalOpened}
              dataset={selectedErrorDataset}
              errors={errorsForSelectedDataset}
              onClose={onErrorModalClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
