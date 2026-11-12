import useAvailability from 'hooks/useAvailability';
import { useTranslation } from 'react-i18next';
import { isOfferedRasterFilter } from 'utilities/rasterFilter';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarLandEnvironment } from '../FilteringSidebarLandEnvironment/FilteringSidebarLandEnvironment';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarContent.module.scss';

export function FilteringSidebarContent() {
  const { t } = useTranslation('availability');
  const { allRasterCategories } = useAvailability();

  const hasRasterFilters = allRasterCategories?.some(isOfferedRasterFilter) ?? false;

  return (
    <div className={styles.FilteringSidebarContent}>
      <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
        <p className={styles.Title}>{t('filtering_sidebar_content.data_scope')}</p>
        <FilteringSidebarDataScope />
      </div>
      <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
        <p className={styles.Title}>{t('filtering_sidebar_content.soil_parameters')}</p>
        <FilteringSidebarParameters />
      </div>
      {hasRasterFilters && (
        <div data-testid="sh-filtering-sidebar-section" className={styles.Section}>
          <p className={styles.Title}>{t('filtering_sidebar_content.land_environment')}</p>
          <FilteringSidebarLandEnvironment />
        </div>
      )}
    </div>
  );
}
