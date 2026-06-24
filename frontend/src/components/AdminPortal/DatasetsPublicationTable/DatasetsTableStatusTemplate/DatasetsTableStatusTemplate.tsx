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

  return (
    <div className={styles.StatusCell}>
      <Tag text={t(`datasets.list.status.${dataset.status}`)} className={classnames(styles.Tag, styles[dataset.status])} />
      {dataset.hasErrors && (
        <button className={styles.ErrorLink} onClick={() => onShowErrors(dataset)}>
          <NewTabIcon className={styles.ErrorLinkIcon} />
          {t('datasets.list.error_details_link')}
        </button>
      )}
    </div>
  );
}
