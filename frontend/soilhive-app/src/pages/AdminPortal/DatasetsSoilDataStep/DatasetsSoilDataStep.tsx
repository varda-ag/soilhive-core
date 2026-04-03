import { useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Button, FileUploadBox } from 'components/UI';
import { SoilDataFileRow } from './SoilDataFileRow/SoilDataFileRow';
import { useDatasetsSoilData } from '../../../hooks/useDatasetsSoilData';
import styles from './DatasetsSoilDataStep.module.scss';
import InfoIcon from 'assets/icons/info-icon.svg?react';

const TEMPLATE_DOCS_URL = '#';

export function DatasetsSoilDataStep() {
  const { t } = useTranslation('admin');
  const {
    fileInputRef,
    soilDataFiles,
    uploadingFiles,
    uploadErrors,
    isContinueEnabled,
    handleFiles,
    handleCrsChange,
    removeFile,
    clearAll,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  } = useDatasetsSoilData();

  /**
   * Reshapes soilDataFiles into the [key: filename]: [progress] format
   * required by FileUploadBox and ProgressBar.
   */
  const progressMapping = useMemo(() => Object.fromEntries(soilDataFiles.map(f => [f.file.name, [f.progress ?? 0]])), [soilDataFiles]);

  return (
    <div className={styles.DatasetsSoilDataStep}>
      <h2 className={styles.Title}>{t('datasets.soil_data.title')}</h2>

      <div className={styles.InfoBanner}>
        <InfoIcon className={styles.InfoIcon} />
        <Trans
          t={t}
          i18nKey="datasets.soil_data.template_docs_banner"
          components={{
            a: <a href={TEMPLATE_DOCS_URL} target="_blank" rel="noopener noreferrer" className={styles.DocLink} />,
          }}
        />
      </div>

      <FileUploadBox
        files={uploadingFiles}
        uploadProgress={progressMapping}
        fileInputRef={fileInputRef}
        caption={t('datasets.soil_data.upload_caption')}
        handleFiles={handleFiles}
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
                  key={soilDataFile.id ?? soilDataFile.tmpId}
                  soilDataFile={soilDataFile}
                  onCrsChange={handleCrsChange}
                  onRemove={() => removeFile(soilDataFile.tmpId)}
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
          <Button type="secondary" size="small" onClick={handleSaveAndContinueLater}>
            {t('datasets.actions.save_and_continue_later')}
          </Button>

          <Button type="primary" size="small" onClick={handleContinue} isDisabled={!isContinueEnabled}>
            {t('datasets.actions.continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
