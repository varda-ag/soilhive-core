import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import classnames from 'classnames';

import CodeIcon from 'assets/icons/code-icon.svg?react';
import FaceIdIconSelected from 'assets/icons/face-id-icon-selected.svg?react';
import FaceIdIconDeselected from 'assets/icons/face-id-icon-deselected.svg?react';
import LockCircleIconSelected from 'assets/icons/lock-circle-icon-selected.svg?react';
import LockCircleIconDeselected from 'assets/icons/lock-circle-icon-deselected.svg?react';
import LockIcon from 'assets/icons/lock-icon.svg?react';
import UserAddIcon from 'assets/icons/user-add-icon.svg?react';
import TrashIcon from 'assets/icons/trash-icon.svg?react';
import { Button, Table, TextInput } from 'components/UI';
import { ADMIN_PATHS } from '../../../configuration/admin';
import { isValidEmail } from '../../../utilities/validation';
import type { TableColumn } from 'types/components';

import styles from './DatasetsSettingsPage.module.scss';

type Visibility = 'public' | 'private';

type AccessEmail = { email: string };

export function DatasetsSettingsPage() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { id } = useParams();

  const [visibility, setVisibility] = useState<Visibility>('public');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [accessEmails, setAccessEmails] = useState<AccessEmail[]>([]);

  const handleEmailChange = (value: string) => {
    setEmailInput(value);
    setEmailError('');
  };

  const handleEmailBlur = () => {
    if (emailInput.trim() && !isValidEmail(emailInput)) {
      setEmailError(t('datasets.settings.access.email_invalid'));
    }
  };

  const handleAddEmail = () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError(t('datasets.settings.access.email_invalid'));
      return;
    }
    if (accessEmails.some(e => e.email === trimmed)) return;
    setAccessEmails(prev => [...prev, { email: trimmed }]);
    setEmailInput('');
    setEmailError('');
  };

  const handleRemoveEmail = (email: string) => {
    setAccessEmails(prev => prev.filter(e => e.email !== email));
  };

  const accessColumns: TableColumn<AccessEmail>[] = [
    {
      name: t('datasets.settings.access.table_column_email'),
      value: 'email',
      sortable: true,
      bodyTemplate: row => (
        <div className={styles.EmailTableRow}>
          <span>{row.email}</span>
          <button className={styles.TrashButton} onClick={() => handleRemoveEmail(row.email)}>
            <TrashIcon className={styles.TrashIcon} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.DatasetsSettingsPage}>
      <div className={styles.Wrapper}>
        <div className={styles.Header}>
          <h2 className={styles.PageTitle}>{t('datasets.settings.title')}</h2>
          <span className={styles.DatasetName}>{id}</span>
        </div>

        <hr className={styles.Divider} />

        <div className={styles.Section}>
          <div className={styles.SectionHeader}>
            <CodeIcon className={styles.SectionIcon} />
            <h3 className={styles.SectionTitle}>{t('datasets.settings.metadata_preview.title')}</h3>
          </div>
          <p className={styles.SectionDescription}>{t('datasets.settings.metadata_preview.description')}</p>
          <a href="#" className={styles.MetadataLink}>
            {t('datasets.settings.metadata_preview.link')}
          </a>
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

          {visibility === 'private' && (
            <div className={styles.AccessSection}>
              <div className={styles.AccessSectionHeader}>
                <UserAddIcon className={styles.AccessSectionIcon} />
                <h4 className={styles.AccessSectionTitle}>{t('datasets.settings.access.title')}</h4>
              </div>
              <div className={styles.EmailInputRow}>
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
                <Button type="primary" size="small" onClick={handleAddEmail} isDisabled={!isValidEmail(emailInput)}>
                  {t('datasets.settings.access.add_button')}
                </Button>
              </div>
              <Table<AccessEmail> value={accessEmails} columns={accessColumns} scrollHeight="auto" />
            </div>
          )}
        </div>
      </div>

      <div className={styles.Actions}>
        <Button type="secondary" onClick={() => navigate(ADMIN_PATHS.DATASETS)}>
          {t('datasets.settings.actions.cancel')}
        </Button>
        <Button type="primary">{t('datasets.settings.actions.publish')}</Button>
      </div>
    </div>
  );
}
