import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import { FiltersCounter } from '../FiltersCounter/FiltersCounter';

import styles from './FilteringSidebarHeader.module.scss';

interface Props {
  onClose: () => void;
}

export function FilteringSidebarHeader({ onClose }: Props) {
  return (
    <div data-testid="sh-filtering-sidebar-header" className={styles.FilteringSidebarHeader} role="button" onClick={onClose}>
      <div className={styles.Title}>
        <FiltersIcon /> Filters <FiltersCounter />
      </div>

      <CrossIcon />
    </div>
  );
}
