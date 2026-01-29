import { Accordion } from 'components/UI';
import { FilteringSidebarDataScope } from '../FilteringSidebarDataScope/FilteringSidebarDataScope';
import { FilteringSidebarParameters } from '../FilteringSidebarParameters/FilteringSidebarParameters';

import styles from './FilteringSidebarContent.module.scss';

export function FilteringSidebarContent() {
  return (
    <div className={styles.FilteringSidebarContent}>
      <Accordion title="Data scope" openedFromStart={true}>
        <FilteringSidebarDataScope />
      </Accordion>
      <Accordion title="Soil parameters" openedFromStart={true}>
        <FilteringSidebarParameters />
      </Accordion>
    </div>
  );
}
