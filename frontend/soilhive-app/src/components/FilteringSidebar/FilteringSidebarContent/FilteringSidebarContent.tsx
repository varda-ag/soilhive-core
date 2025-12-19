import { Accordion } from 'components/UI';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FiltertingSidebarParameters } from '../FiltertingSidebarParameters/FiltertingSidebarParameters';
import { FiltertingSidebarLandEcosystem } from '../FilteringSidebarLandEcosystem/FiltertingSidebarLandEcosystem';

import styles from './FilteringSidebarContent.module.scss';

export function FilteringSidebarContent() {
  return (
    <div className={styles.FilteringSidebarContent}>
      <Accordion title="Data scope" openedFromStart={true}>
        <FilteringSidebarDataScope />
      </Accordion>
      <Accordion title="Soil parameters" openedFromStart={true}>
        <FiltertingSidebarParameters />
      </Accordion>
      <Accordion title="Land & ecosystem" openedFromStart={true}>
        <FiltertingSidebarLandEcosystem />
      </Accordion>
    </div>
  );
}
