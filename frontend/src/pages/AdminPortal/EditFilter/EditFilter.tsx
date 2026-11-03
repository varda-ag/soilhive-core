import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button, Loader } from 'components/UI';
import ArrowLeftIcon from 'assets/icons/arrow-left-icon.svg?react';
import { FilterSection } from 'components/AdminPortal/RasterFilterForm/FilterSection/FilterSection';
import { FilterDescriptionForm } from 'components/AdminPortal/RasterFilterForm/FilterDescriptionForm/FilterDescriptionForm';
import { FilterMappings } from 'components/AdminPortal/RasterFilterForm/FilterMappings/FilterMappings';
import { FilterInstallingPanel } from 'components/AdminPortal/RasterFilterForm/FilterInstallingPanel/FilterInstallingPanel';
import { useEditFilter } from 'hooks/useEditFilter';
import { ADMIN_PATHS } from 'configuration/admin';

import styles from './EditFilter.module.scss';

export function EditFilter() {
  const { t } = useTranslation('admin');
  const { filterId } = useParams();
  const {
    filter,
    formData,
    isLoading,
    isInstalling,
    installProgress,
    isInstalled,
    isEnabled,
    mappingRows,
    isSaveEnabled,
    handleChange,
    handleLabelChange,
    clearLabel,
    handleSave,
  } = useEditFilter(filterId);

  return (
    <div className={styles.EditFilter}>
      <Button className={styles.BackButton} type="tertiary" to={ADMIN_PATHS.FILTERS} dataTestId="sh-edit-filter-back">
        <ArrowLeftIcon />
        {t('createFilter.back')}
      </Button>

      <div className={styles.Sections}>
        {isLoading && <Loader />}

        {isInstalling && <FilterInstallingPanel progress={installProgress} />}

        {filter && !isInstalling && (
          <FilterSection title={t('createFilter.description_section.title')} message={t('createFilter.description_section.message')}>
            <FilterDescriptionForm formData={formData} onChange={handleChange} />
          </FilterSection>
        )}

        {isInstalled && (
          <FilterSection
            title={t('createFilter.mappings.title')}
            message={t('createFilter.mappings.message')}
            actions={
              <Button type="primary" isDisabled={!isSaveEnabled} onClick={handleSave} dataTestId="sh-edit-filter-save">
                {/* An enabled filter is already labelled, so this only saves changes */}
                {isEnabled ? t('createFilter.save') : t('createFilter.save_and_finish')}
              </Button>
            }
          >
            <FilterMappings rows={mappingRows} onLabelChange={handleLabelChange} onClear={clearLabel} />
          </FilterSection>
        )}
      </div>
    </div>
  );
}
