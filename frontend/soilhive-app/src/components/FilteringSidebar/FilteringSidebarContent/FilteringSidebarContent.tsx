import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarContent.module.scss';

export function FilteringSidebarContent() {
  return (
    <div className={styles.FilteringSidebarContent}>
      <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
        <p className={styles.Title}>Data scope</p>
        <FilteringSidebarDataScope />
      </div>
      <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
        <p className={styles.Title}>Soil parameters</p>
        <FilteringSidebarParameters />
      </div>
    </div>
  );
}
