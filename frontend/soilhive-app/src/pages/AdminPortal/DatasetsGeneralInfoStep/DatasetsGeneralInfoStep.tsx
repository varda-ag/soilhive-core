import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import classnames from 'classnames';
import { Button, FormMessage } from 'components/UI';
import { TextInput } from 'components/UI';
import { useGeneralInfoForm } from 'hooks/useGeneralInfoForm';
import InfoSquareIcon from 'assets/icons/info-square-icon.svg?react';
import styles from './DatasetsGeneralInfoStep.module.scss';

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
        <h2 className={styles.PageTitle}>{t('datasets.general_info.page_title')}</h2>

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

            <label className={classnames(styles.TextAreaLabel, { [styles.Invalid]: !!errors.description })}>
              <div className={styles.LabelText}>
                <span>{t('datasets.general_info.fields.description')}</span>
                <span className={styles.RequiredMark}>*</span>
              </div>
              <textarea
                data-testid="sh-general-info-description"
                className={classnames(styles.TextArea, { [styles.Invalid]: !!errors.description })}
                name="description"
                value={formData.description}
                maxLength={descriptionMaxLength}
                rows={5}
                onChange={e => handleChange('description', e.target.value)}
              />
              <div className={styles.TextAreaFooter}>
                {errors.description && <FormMessage type="error" message={errors.description} />}
                <span className={styles.CharCount}>
                  {descriptionMaxLength - formData.description.length} {t('datasets.general_info.fields.symbols_left')}
                </span>
              </div>
            </label>

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
        <Button type="secondary" isDisabled={isSaving} onClick={handleSaveAndContinueLater} dataTestId="sh-general-info-save-later">
          {t('datasets.general_info.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" isDisabled={isSaving} onClick={handleContinue} dataTestId="sh-general-info-continue">
          {t('datasets.general_info.actions.continue')}
        </Button>
      </div>
    </>
  );
}
