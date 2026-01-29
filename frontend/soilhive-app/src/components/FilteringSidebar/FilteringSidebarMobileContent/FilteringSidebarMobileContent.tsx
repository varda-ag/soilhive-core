import { useState } from 'react';
import { MobileTabNavigation } from 'components/UI';
import type { MobileTabNavigationConfig } from 'types/components';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarMobileContent.module.scss';

const config: MobileTabNavigationConfig[] = [
  {
    name: 'Data scope',
    id: 'scope',
  },
  {
    name: 'Soil parameters',
    id: 'parameters',
  },
];

export function FilteringSidebarMobileContent() {
  const [activeTab, setActiveTab] = useState<string>('scope');

  return (
    <div className={styles.FilteringSidebarMobileContent}>
      <div className={styles.TabsWrapper}>
        <MobileTabNavigation className={styles.Tabs} config={config} type="secondary" active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'scope' && <FilteringSidebarDataScope />}
      {activeTab === 'parameters' && <FilteringSidebarParameters />}
    </div>
  );
}
