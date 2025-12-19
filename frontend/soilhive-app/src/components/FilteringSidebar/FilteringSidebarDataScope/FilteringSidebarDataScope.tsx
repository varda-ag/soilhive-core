import { Accordion } from 'components/UI';

import styles from './FilteringSidebarDataScope.module.scss';

export function FilteringSidebarDataScope() {
  return (
    <div className={styles.FilteringSidebarDataScope}>
      <Accordion title="Data type" type="secondary">
        Data type content
      </Accordion>
      <Accordion title="Time" type="secondary">
        Time content
      </Accordion>
    </div>
  );
}
