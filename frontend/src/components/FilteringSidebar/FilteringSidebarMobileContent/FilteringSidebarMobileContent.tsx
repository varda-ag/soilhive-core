import { useState } from 'react';
import { MobileTabNavigation } from 'components/UI';
import type { MobileTabNavigationConfig } from 'types/components';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarMobileContent.module.scss';
import { FilteringSidebarLandEcosystem } from '../FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem';

const config: MobileTabNavigationConfig[] = [
  {
    name: 'Data scope',
    id: 'scope',
  },
  {
    name: 'Soil parameters',
    id: 'parameters',
  },
  {
    name: 'Land & Ecosystem',
    id: 'land-ecosystem',
  },
];

export function FilteringSidebarMobileContent() {
  const [activeTab, setActiveTab] = useState<string>('scope');

  return (
    <div className={styles.FilteringSidebarMobileContent}>
      <div className={styles.TabsWrapper}>
        <MobileTabNavigation
          className={styles.Tabs}
          config={config}
          type="secondary"
          fontSize="lg"
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'scope' && <FilteringSidebarDataScope />}
      {activeTab === 'parameters' && <FilteringSidebarParameters />}
      {activeTab === 'land-ecosystem' && <FilteringSidebarLandEcosystem />}
    </div>
  );
}
