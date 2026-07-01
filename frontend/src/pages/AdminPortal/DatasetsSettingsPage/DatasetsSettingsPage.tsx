import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import classnames from 'classnames';

import CodeIcon from 'assets/icons/code-icon.svg?react';
import WarningIcon from 'assets/icons/warning-icon.svg?react';
import FaceIdIconSelected from 'assets/icons/face-id-icon-selected.svg?react';
import FaceIdIconDeselected from 'assets/icons/face-id-icon-deselected.svg?react';
import LockCircleIconSelected from 'assets/icons/lock-circle-icon-selected.svg?react';
import LockCircleIconDeselected from 'assets/icons/lock-circle-icon-deselected.svg?react';
import LockIcon from 'assets/icons/lock-icon.svg?react';
import UserAddIcon from 'assets/icons/user-add-icon.svg?react';
import TrashIcon from 'assets/icons/trash-icon.svg?react';
import ShieldGlobeIcon from 'assets/icons/shield-globe-icon.svg?react';
import { Button, Dialog, Table, TextInput } from 'components/UI';
import { isValidEmail } from '../../../utilities/validation';
import { useDatasetsSettings } from '../../../hooks/useDatasetsSettings';
import type { AccessEmail } from '../../../hooks/useDatasetsSettings';
import type { TableColumn } from 'types/components';

import styles from './DatasetsSettingsPage.module.scss';

export function DatasetsSettingsPage() {
  const { t } = useTranslation('admin');
  const { id } = useParams();

  const {
    isLoading,
    isSaving,
    isOidcAuth,
    hasMandatoryMetadata,
    visibility,
    setVisibility,
    emailInput,
    emailError,
    accessEmails,
    emailToDelete,
    isPublishWarningVisible,
    handleEmailChange,
    handleEmailBlur,
    handleAddEmail,
    handleRequestRemoveEmail,
    handleConfirmRemoveEmail,
    handleCancelRemoveEmail,
    handlePublish,
    handlePublishProceed,
    handlePublishCancel,
    handleCancel,
  } = useDatasetsSettings(id);

  const accessColumns: TableColumn<AccessEmail>[] = [
    {
      name: t('datasets.settings.access.table_column_email'),
      value: 'email',
      sortable: true,
      bodyTemplate: row => <span className={styles.EmailCell}>{row.email}</span>,
    },
    {
      name: '',
      value: 'email',
      bodyTemplate: row => (
        <div className={styles.TrashCell}>
          <Button type="custom" className={styles.TrashButton} isIconOnly onClick={() => handleRequestRemoveEmail(row.email)}>
            <TrashIcon />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) return null;

  return (
    <div className={styles.DatasetsSettingsPage}>
      <div className={styles.Wrapper}>
        <div className={styles.Header}>
          <h2 className={styles.PageTitle}>{t('datasets.settings.title')}</h2>
          <div className={styles.Separator} />
          <span className={styles.DatasetName}>{id}</span>
        </div>

        <hr className={styles.Divider} />

        <div className={styles.Section}>
          <div className={styles.SectionHeader}>
            <CodeIcon className={styles.SectionIcon} />
            <h3 className={styles.SectionTitle}>{t('datasets.settings.metadata_preview.title')}</h3>
          </div>
          <p className={styles.SectionDescription}>{t('datasets.settings.metadata_preview.description')}</p>
          <Link to={`/datasets/${id}`} className={styles.MetadataLink} target="_blank">
            {t('datasets.settings.metadata_preview.link')}
          </Link>
          {!hasMandatoryMetadata && (
            <div className={styles.MandatoryWarning} data-testid="mandatory-metadata-warning">
              <WarningIcon className={styles.MandatoryWarningIcon} />
              <span>{t('datasets.settings.metadata_preview.mandatory_warning')}</span>
            </div>
          )}
        </div>

        <div className={styles.Section}>
          <div className={styles.SectionHeader}>
            <LockIcon className={styles.SectionIcon} />
            <h3 className={styles.SectionTitle}>{t('datasets.settings.visibility.title')}</h3>
          </div>

          <div className={styles.RadioCards}>
            <div
              role="radio"
              aria-checked={visibility === 'public'}
              className={classnames(styles.RadioCard, { [styles.Selected]: visibility === 'public' })}
              onClick={() => setVisibility('public')}
            >
              {visibility === 'public' ? (
                <FaceIdIconSelected className={styles.RadioCardIcon} />
              ) : (
                <FaceIdIconDeselected className={styles.RadioCardIcon} />
              )}
              <div className={styles.RadioCardContent}>
                <p className={styles.RadioCardTitle}>{t('datasets.settings.visibility.public.title')}</p>
                <p className={styles.RadioCardDescription}>{t('datasets.settings.visibility.public.description')}</p>
              </div>
              <div className={classnames(styles.RadioIndicator, { [styles.RadioIndicatorSelected]: visibility === 'public' })} />
            </div>

            <div
              role="radio"
              aria-checked={visibility === 'private'}
              className={classnames(styles.RadioCard, { [styles.Selected]: visibility === 'private' })}
              onClick={() => setVisibility('private')}
            >
              {visibility === 'private' ? (
                <LockCircleIconSelected className={styles.RadioCardIcon} />
              ) : (
                <LockCircleIconDeselected className={styles.RadioCardIcon} />
              )}
              <div className={styles.RadioCardContent}>
                <p className={styles.RadioCardTitle}>{t('datasets.settings.visibility.private.title')}</p>
                <p className={styles.RadioCardDescription}>{t('datasets.settings.visibility.private.description')}</p>
              </div>
              <div className={classnames(styles.RadioIndicator, { [styles.RadioIndicatorSelected]: visibility === 'private' })} />
            </div>
          </div>

          {visibility === 'private' && isOidcAuth && (
            <div className={styles.AccessSection}>
              <div className={styles.AccessSectionHeader}>
                <UserAddIcon className={styles.AccessSectionIcon} />
                <h4 className={styles.AccessSectionTitle}>{t('datasets.settings.access.title')}</h4>
              </div>
              <form
                id="add-email-form"
                className={styles.EmailInputRow}
                onSubmit={e => {
                  e.preventDefault();
                  handleAddEmail();
                }}
              >
                <TextInput
                  className={styles.EmailInput}
                  label={t('datasets.settings.access.email_label')}
                  placeholder={t('datasets.settings.access.email_placeholder')}
                  value={emailInput}
                  isError={!!emailError}
                  errorMessage={emailError}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                />
                <Button
                  className={styles.EmailAddButton}
                  type="primary"
                  size="small"
                  form="add-email-form"
                  isDisabled={!isValidEmail(emailInput)}
                >
                  {t('datasets.settings.access.add_button')}
                </Button>
              </form>
              <Table<AccessEmail> value={accessEmails} columns={accessColumns} scrollHeight="auto" dataKey="email" />
            </div>
          )}
        </div>
      </div>

      <div className={styles.Actions}>
        <Button type="secondary" onClick={handleCancel}>
          {t('datasets.settings.actions.cancel')}
        </Button>
        <Button type="primary" isDisabled={isSaving || !hasMandatoryMetadata} onClick={handlePublish}>
          {t('datasets.settings.actions.publish')}
        </Button>
      </div>

      <Dialog
        visible={emailToDelete !== null}
        header={t('datasets.settings.access.remove_dialog.title')}
        secondaryText={t('datasets.settings.access.remove_dialog.cancel')}
        primaryText={t('datasets.settings.access.remove_dialog.confirm')}
        className={styles.RemoveDialog}
        onPrimary={handleConfirmRemoveEmail}
        onSecondary={handleCancelRemoveEmail}
      >
        <div className={styles.RemoveDialogContent}>
          <TrashIcon className={styles.RemoveDialogIcon} />
          <p className={styles.RemoveDialogMessage}>{t('datasets.settings.access.remove_dialog.message')}</p>
        </div>
      </Dialog>

      <Dialog
        visible={isPublishWarningVisible}
        header={t('datasets.settings.publish_warning.title')}
        secondaryText={t('datasets.settings.publish_warning.proceed')}
        primaryText={t('datasets.settings.publish_warning.cancel')}
        className={styles.PublishWarningDialog}
        onPrimary={handlePublishCancel}
        onSecondary={handlePublishProceed}
        onClose={handlePublishCancel}
      >
        <div className={styles.PublishWarningContent}>
          <ShieldGlobeIcon className={styles.PublishWarningIcon} />
          <h4 className={styles.PublishWarningHeading}>{t('datasets.settings.publish_warning.heading')}</h4>
          <p className={styles.PublishWarningDescription}>{t('datasets.settings.publish_warning.description')}</p>
          <div className={styles.PublishWarningBox}>
            <p className={styles.PublishWarningBoxText}>
              ⚠ <strong>{t('datasets.settings.publish_warning.warning_bold')}</strong>{' '}
              {t('datasets.settings.publish_warning.warning_suffix')} ⚠
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
