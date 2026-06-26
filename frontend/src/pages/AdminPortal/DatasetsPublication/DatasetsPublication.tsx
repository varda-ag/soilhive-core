import { useTranslation } from 'react-i18next';

import PlusIcon from 'assets/icons/small-plus-icon.svg?react';
import { Button, Loader, TextInput } from 'components/UI';
import { useDatasetsPublicationList } from 'hooks/useDatasetsPublicationList';
import { DatasetsPublicationTable } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsPublicationTable';
import { DatasetDeleteModal } from 'components/AdminPortal/DatasetDeleteModal/DatasetDeleteModal';
import { DatasetErrorModal } from 'components/AdminPortal/DatasetErrorModal/DatasetErrorModal';

import styles from './DatasetsPublication.module.scss';

export function DatasetsPublication() {
  const { t } = useTranslation('admin');

  const {
    isLoading,
    filteredDatasets,
    searchValue,
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
  } = useDatasetsPublicationList();

  return (
    <div className={styles.DatasetsPublication}>
      <div className={styles.Wrapper}>
        {isLoading && <Loader />}
        {!isLoading && (
          <>
            <div className={styles.Actions}>
              <TextInput
                className={styles.Search}
                size="small"
                value={searchValue}
                placeholder={t('datasets.list.search_placeholder')}
                isSearch={true}
                isClearable
                onChange={setSearchValue}
              />
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
