import { Trans, useTranslation } from 'react-i18next';

import { Button, FileUploadBox, Loader } from 'components/UI';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import { SoilDataFileRow } from '../DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow';
import { FilterSection } from 'components/AdminPortal/RasterFilterForm/FilterSection/FilterSection';
import { FilterBandDropdown } from 'components/AdminPortal/RasterFilterForm/FilterBandDropdown/FilterBandDropdown';
import { FilterDescriptionForm } from 'components/AdminPortal/RasterFilterForm/FilterDescriptionForm/FilterDescriptionForm';
import { useCreateFilter, FILTER_ALLOWED_EXTENSIONS } from 'hooks/useCreateFilter';
import { useStorageConfig } from 'hooks/useStorageConfig';
import { formatUploadSize } from 'utilities/formatUploadSize';
import { ADMIN_PATHS } from 'configuration/admin';

import styles from './CreateFilter.module.scss';

export function CreateFilter() {
  const { t } = useTranslation('admin');
  const { t: tCommon } = useTranslation('common');
  const { storageConfig } = useStorageConfig();
  const maxUploadSizeMB = storageConfig?.maxUploadSizeMB;
  const {
    fileInputRef,
    filterFile,
    uploadingFiles,
    uploadProgress,
    uploadErrors,
    crsOptions,
    handleFiles,
    handleCrsChange,
    handleCrsSelect,
    removeFile,
    band,
    isBandRequired,
    handleBandChange,
    formData,
    isCreating,
    isInstallEnabled,
    handleChange,
    handleInstall,
  } = useCreateFilter();

  return (
    <div className={styles.CreateFilter}>
      <Button className={styles.BackButton} type="tertiary" to={ADMIN_PATHS.FILTERS} dataTestId="sh-create-filter-back">
        <ArrowLeftIcon />
        {t('createFilter.back')}
      </Button>

      <div className={styles.Sections}>
        {isCreating && <Loader />}

        <div className={styles.Section}>
          <h2 className={styles.Title}>{t('createFilter.title')}</h2>
          <p className={styles.Message}>{t('createFilter.message')}</p>

          <FileUploadBox
            files={uploadingFiles}
            uploadProgress={uploadProgress}
            fileInputRef={fileInputRef}
            caption={
              maxUploadSizeMB !== undefined
                ? `${t('createFilter.upload_caption')} ${t('datasets.soil_data.max_size_caption', { size: formatUploadSize(maxUploadSizeMB) })}`
                : t('createFilter.upload_caption')
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
            accept={FILTER_ALLOWED_EXTENSIONS.join(', ')}
            errorMessage={uploadErrors}
            isSingleFileUpload
          />

          {filterFile && (
            <div className={styles.FileList}>
              <span className={styles.FileCount}>{t('datasets.soil_data.files_uploaded_count', { count: 1 })}</span>
              <SoilDataFileRow
                soilDataFile={filterFile}
                onCrsChange={handleCrsChange}
                onCrsSelect={handleCrsSelect}
                onRemove={removeFile}
                crsOptions={crsOptions}
                showNoData={false}
              />
              {isBandRequired && <FilterBandDropdown bands={filterFile.rasterBands ?? []} value={band} onChange={handleBandChange} />}
            </div>
          )}
        </div>

        {filterFile && (
          <FilterSection
            title={t('createFilter.description_section.title')}
            message={t('createFilter.description_section.message')}
            actions={
              <Button type="primary" isDisabled={!isInstallEnabled} onClick={handleInstall} dataTestId="sh-create-filter-install">
                {t('createFilter.install')}
              </Button>
            }
          >
            <FilterDescriptionForm formData={formData} onChange={handleChange} />
          </FilterSection>
        )}
      </div>
    </div>
  );
}
