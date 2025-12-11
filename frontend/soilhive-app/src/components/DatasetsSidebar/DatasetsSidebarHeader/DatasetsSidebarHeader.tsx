import DatasetsIcon from 'assets/icons/small-paste-icon.svg?react';
import SidebarIcon from 'assets/icons/sidebar-icon.svg?react';

import styles from './DatasetsSidebarHeader.module.scss';

interface Props {
  onClose: () => void;
}

export function DatasetsSidebarHeader({ onClose }: Props) {
  return (
    <div data-testid="sh-datasets-sidebar-header" className={styles.DatasetsSidebarHeader} role="button" onClick={onClose}>
      <div className={styles.Title}>
        <div className={styles.DatasetsIconWrapper}>
          <DatasetsIcon />
        </div>
        Available Datasets
      </div>
      <div className={styles.SidebarIconWrapper}>
        <SidebarIcon />
      </div>
    </div>
  );
}
