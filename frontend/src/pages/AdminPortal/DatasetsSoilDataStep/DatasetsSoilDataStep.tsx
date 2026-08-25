import { Trans, useTranslation } from 'react-i18next';

import { Button, FileUploadBox } from 'components/UI';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import { SoilDataFileRow } from './SoilDataFileRow/SoilDataFileRow';
import { useDatasetsSoilData, ALLOWED_EXTENSIONS } from '../../../hooks/useDatasetsSoilData';
import { useStorageConfig } from 'hooks/useStorageConfig';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';

import styles from './DatasetsSoilDataStep.module.scss';

const DOCS_URL = `${INGESTION_DOCS_URL}#soil-data--upload-your-files`;

export function DatasetsSoilDataStep() {
  const { t } = useTranslation('admin');
  const { t: tCommon } = useTranslation('common');
  const { storageConfig } = useStorageConfig();
  const maxUploadSizeMB = storageConfig?.maxUploadSizeMB;
  const {
    datasetName,
    fileInputRef,
    soilDataFiles,
    uploadingFiles,
    uploadErrors,
    uploadProgress,
    isContinueEnabled,
    isSaving,
    handleFiles,
    handleCrsChange,
    removeFile,
    clearAll,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
    crsOptions,
  } = useDatasetsSoilData();

  return (
    <div className={styles.DatasetsSoilDataStep}>
      <IngestionStepTitleRow
        className={styles.TitleRow}
        title={t('datasets.soil_data.title')}
        datasetName={datasetName}
        docsLink={DOCS_URL}
      />

      <FileUploadBox
        files={uploadingFiles}
        uploadProgress={uploadProgress}
        fileInputRef={fileInputRef}
        caption={
          maxUploadSizeMB !== undefined
            ? `${t('datasets.soil_data.upload_caption')} ${t('datasets.soil_data.max_size_caption', { size: maxUploadSizeMB })}`
            : t('datasets.soil_data.upload_caption')
        }
        title={
          <Trans
            t={tCommon}
            i18nKey="components.file_upload_box.title"
            components={{
              span: <span />,
            }}
          />
        }
        uploadingText={tCommon('components.file_upload_box.uploading')}
        handleFiles={handleFiles}
        accept={ALLOWED_EXTENSIONS.join(', ')}
        errorMessage={uploadErrors}
      />

      <div className={styles.FileListContainer}>
        {soilDataFiles.length > 0 && (
          <div className={styles.FileList}>
            <div className={styles.FileListHeader}>
              <span className={styles.FileCount}>{t('datasets.soil_data.files_uploaded_count', { count: soilDataFiles.length })}</span>
              <button type="button" className={styles.ClearAll} onClick={clearAll}>
                {t('datasets.soil_data.clear_all')}
              </button>
            </div>
            <div className={styles.FileRows}>
              {soilDataFiles.map(soilDataFile => (
                <SoilDataFileRow
                  key={soilDataFile.id}
                  soilDataFile={soilDataFile}
                  onCrsChange={handleCrsChange}
                  onRemove={() => removeFile(soilDataFile.id)}
                  crsOptions={crsOptions}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={styles.Footer}>
        <Button type="secondary" size="small" onClick={handlePrevious}>
          {t('datasets.actions.previous')}
        </Button>

        <div className={styles.FooterRight}>
          <Button type="secondary" size="small" onClick={handleSaveAndContinueLater} isDisabled={!isContinueEnabled || isSaving}>
            {t('datasets.actions.save_and_continue_later')}
          </Button>

          <Button type="primary" size="small" onClick={handleContinue} isDisabled={!isContinueEnabled || isSaving}>
            {t('datasets.actions.continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
