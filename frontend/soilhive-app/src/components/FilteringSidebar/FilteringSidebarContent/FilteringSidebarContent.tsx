import useAvailability from 'hooks/useAvailability';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarLandEcosystem } from '../FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarContent.module.scss';

export function FilteringSidebarContent() {
  const { allRasterCategories } = useAvailability();

  const hasRasterFilters = allRasterCategories?.some(cat => cat.id !== 'soil_groups' && cat.enabled) ?? false;

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
      {hasRasterFilters && (
        <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
          <p className={styles.Title}>LAND & ECOSYSTEM</p>
          <FilteringSidebarLandEcosystem />
        </div>
      )}
    </div>
  );
}
