import FiltersIcon from 'assets/icons/filter2-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import { FiltersCounter } from '../FiltersCounter/FiltersCounter';
import useAvailability from 'hooks/useAvailability';

import styles from './FilteringSidebarHeader.module.scss';

interface Props {
  onClose: () => void;
}

export function FilteringSidebarHeader({ onClose }: Props) {
  const { clearAllFilters, isFiltersSelected } = useAvailability();
  return (
    <div data-testid="sh-filtering-sidebar-header" className={styles.FilteringSidebarHeader}>
      <div className={styles.Title}>
        <FiltersIcon /> Filters <FiltersCounter />
      </div>

      <div className={styles.Actions}>
        {isFiltersSelected && (
          <span className={styles.ClearAll} data-testid="sh-filtering-sidebar-header-clear-all" role="button" onClick={clearAllFilters}>
            Clear all
          </span>
        )}
        <CrossIcon data-testid="sh-close-icon" role="button" onClick={onClose} />
      </div>
    </div>
  );
}
