import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import NewTabIcon from 'assets/icons/small-new-tab-icon.svg?react';
import { Tag } from 'components/UI';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';

import styles from './DatasetsTableStatusTemplate.module.scss';

interface Props {
  dataset: DatasetsPublicationListItem;
  onShowErrors: (dataset: DatasetsPublicationListItem) => void;
}

export function DatasetsTableStatusTemplate({ dataset, onShowErrors }: Props) {
  const { t } = useTranslation('admin');
  // Queued is not an ingestion status: it replaces the status tag until the job starts
  const status = dataset.isQueued ? 'QUEUED' : dataset.status;

  return (
    <div className={styles.StatusCell}>
      <Tag text={t(`datasets.list.status.${status}`)} className={classnames(styles.Tag, styles[status])} />
      {dataset.hasErrors && (
        <button className={styles.ErrorLink} onClick={() => onShowErrors(dataset)}>
          <NewTabIcon className={styles.ErrorLinkIcon} />
          <span className={styles.ErrorLinkText}>{t('datasets.list.error_details_link')}</span>
        </button>
      )}
    </div>
  );
}
