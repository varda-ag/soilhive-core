import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import DatasetsIcon from 'assets/icons/small-paste-icon.svg?react';
import SidebarIcon from 'assets/icons/sidebar-icon.svg?react';

import styles from './DatasetsSidebarHeader.module.scss';

interface Props {
  preview?: boolean;
  onClose?: () => void;
}

export function DatasetsSidebarHeader({ preview, onClose }: Props) {
  const { t } = useTranslation('availability');
  return (
    <div
      data-testid="sh-datasets-sidebar-header"
      className={classnames(styles.DatasetsSidebarHeader, { [styles.Preview]: preview })}
      role="button"
      onClick={onClose}
    >
      <div className={styles.Title}>
        <div className={styles.DatasetsIconWrapper}>
          <DatasetsIcon />
        </div>
        {t('datasets_sidebar.header')}
      </div>
      <div className={styles.SidebarIconWrapper}>
        <SidebarIcon />
      </div>
    </div>
  );
}
