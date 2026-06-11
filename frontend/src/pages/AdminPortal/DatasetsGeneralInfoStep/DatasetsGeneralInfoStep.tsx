import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Button, FormMessage, TextInput, TextArea } from 'components/UI';
import { useGeneralInfoForm } from 'hooks/useGeneralInfoForm';
import InfoSquareIcon from 'assets/icons/info-square-icon.svg?react';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import { ADMIN_PATHS } from '../../../configuration/admin';
import { INGESTION_DOCS_URL } from 'configuration/ingestion';

import styles from './DatasetsGeneralInfoStep.module.scss';

const DOCS_URL = `${INGESTION_DOCS_URL}#dataset-metadata`;

export function DatasetsGeneralInfoStep() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  const validationMessages = {
    name: t('datasets.general_info.validation.name_required'),
    full_name: t('datasets.general_info.validation.full_name_required'),
    description: t('datasets.general_info.validation.description_required'),
    author: t('datasets.general_info.validation.author_required'),
  };

  const {
    formData,
    errors,
    submitError,
    isLoading,
    isSaving,
    descriptionMaxLength,
    handleChange,
    handleSaveAndContinueLater,
    handleContinue,
  } = useGeneralInfoForm(id, validationMessages);

  if (isLoading) return null;

  return (
    <>
      <div className={styles.DatasetsGeneralInfoStep}>
        <IngestionStepTitleRow className={styles.TitleRow} title={t('datasets.general_info.page_title')} docsLink={DOCS_URL} />

        <div className={styles.Card}>
          <div className={styles.CardHeader}>
            <InfoSquareIcon className={styles.CardHeaderIcon} />
            <h3 className={styles.CardTitle}>{t('datasets.general_info.title')}</h3>
          </div>

          <div className={styles.Form}>
            <TextInput
              label={t('datasets.general_info.fields.name')}
              name="name"
              value={formData.name}
              isRequired
              isError={!!errors.name}
              errorMessage={errors.name}
              onChange={value => handleChange('name', value)}
            />
            <TextInput
              label={t('datasets.general_info.fields.full_name')}
              name="full_name"
              value={formData.full_name}
              isRequired
              isError={!!errors.full_name}
              errorMessage={errors.full_name}
              onChange={value => handleChange('full_name', value)}
            />

            <TextArea
              label={t('datasets.general_info.fields.description')}
              name="description"
              value={formData.description}
              isRequired
              isError={!!errors.description}
              errorMessage={errors.description}
              maxLength={descriptionMaxLength}
              showCounter
              rows={10}
              onChange={value => handleChange('description', value)}
            />

            <TextInput
              label={t('datasets.general_info.fields.author')}
              name="author"
              value={formData.author}
              isRequired
              isError={!!errors.author}
              errorMessage={errors.author}
              helperMessage={t('datasets.general_info.fields.author_helper')}
              onChange={value => handleChange('author', value)}
            />

            {submitError && <FormMessage type="error" message={submitError} />}
          </div>
        </div>
      </div>
      <div className={styles.Actions}>
        <div className={styles.Left}>
          <Button type="secondary" isDisabled={isSaving} to={ADMIN_PATHS.DATASETS} dataTestId="sh-general-info-cancel">
            {t('datasets.actions.cancel')}
          </Button>
        </div>
        <div className={styles.Right}>
          <Button type="secondary" isDisabled={isSaving} onClick={handleSaveAndContinueLater} dataTestId="sh-general-info-save-later">
            {t('datasets.actions.save_and_continue_later')}
          </Button>
          <Button type="primary" isDisabled={isSaving} onClick={handleContinue} dataTestId="sh-general-info-continue">
            {t('datasets.actions.continue')}
          </Button>
        </div>
      </div>
    </>
  );
}
