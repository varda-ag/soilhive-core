import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MobileTabNavigation } from 'components/UI';
import type { MobileTabNavigationConfig } from 'components/UI/types';
import useAvailability from 'hooks/useAvailability';
import { isOfferedRasterFilter } from 'utilities/rasterFilter';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';
import { FilteringSidebarLandEnvironment } from '../FilteringSidebarLandEnvironment/FilteringSidebarLandEnvironment';

import styles from './FilteringSidebarMobileContent.module.scss';

export function FilteringSidebarMobileContent() {
  const { t } = useTranslation('availability');
  const { allRasterCategories } = useAvailability();
  const [activeTab, setActiveTab] = useState<string>('scope');

  const hasRasterFilters = allRasterCategories?.some(isOfferedRasterFilter) ?? false;

  const config: MobileTabNavigationConfig[] = [
    { name: t('filtering_sidebar_content.data_scope'), id: 'scope' },
    { name: t('filtering_sidebar_content.soil_parameters'), id: 'parameters' },
    ...(hasRasterFilters ? [{ name: t('filtering_sidebar_content.land_environment'), id: 'land-environment' }] : []),
  ];

  // Falls back to the first tab if the open one is no longer shown
  const currentTab = config.some(tab => tab.id === activeTab) ? activeTab : 'scope';

  return (
    <div className={styles.FilteringSidebarMobileContent}>
      <div className={styles.TabsWrapper}>
        <MobileTabNavigation
          className={styles.Tabs}
          config={config}
          type="secondary"
          fontSize="lg"
          gap="30px"
          scrollable
          active={currentTab}
          onChange={setActiveTab}
        />
      </div>

      {currentTab === 'scope' && <FilteringSidebarDataScope />}
      {currentTab === 'parameters' && <FilteringSidebarParameters />}
      {currentTab === 'land-environment' && <FilteringSidebarLandEnvironment />}
    </div>
  );
}
