import { useTranslation } from 'react-i18next';

import WarningIcon from 'assets/icons/warning-icon.svg?react';
import BulbIcon from 'assets/icons/bulb-icon.svg?react';
import { Dialog } from 'components/UI';
import type { DatasetErrorItem } from 'types/datasetErrors';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import { dateStringToDDMMYYYY } from '../../../utilities/date';

import styles from './DatasetErrorModal.module.scss';

interface Props {
  visible: boolean;
  dataset: DatasetsPublicationListItem | null;
  errors: DatasetErrorItem[];
  onClose: () => void;
}

export function DatasetErrorModal({ visible, dataset, errors, onClose }: Props) {
  const { t } = useTranslation('admin');

  const actions = errors.map(e => e.action);

  return (
    <Dialog
      visible={visible}
      header={
        <span className={styles.Header}>
          <WarningIcon className={styles.HeaderIcon} />
          {t('datasets.list.error_modal.title')}
        </span>
      }
      primaryText={t('datasets.list.error_modal.close')}
      className={styles.DatasetErrorModal}
      contentClassName={styles.Content}
      onPrimary={onClose}
      onSecondary={onClose}
    >
      <div className={styles.Section}>
        <p className={styles.SectionLabel}>{t('datasets.list.error_modal.dataset_label')}</p>
        <p>
          {dataset?.name}
          {dataset?.updated_at && ` — ${t('datasets.list.error_modal.uploaded_prefix')} ${dateStringToDDMMYYYY(dataset.updated_at)}`}
        </p>
      </div>

      <div className={styles.Section}>
        <p className={styles.SectionLabel}>{t('datasets.list.error_modal.what_happened_label')}</p>
        {errors.map((error, index) => (
          <p key={error.code + index} className={styles.ErrorMessage}>
            {t('datasets.list.error_modal.error_prefix', { index: index + 1 })} {error.message}
          </p>
        ))}
      </div>

      {actions.length > 0 && (
        <div className={styles.SuggestedFixes}>
          <p className={styles.SuggestedFixesTitle}>
            <BulbIcon className={styles.BulbIcon} />
            {t('datasets.list.error_modal.suggested_fixes_title')}
          </p>
          <ul className={styles.FixList}>
            {actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
