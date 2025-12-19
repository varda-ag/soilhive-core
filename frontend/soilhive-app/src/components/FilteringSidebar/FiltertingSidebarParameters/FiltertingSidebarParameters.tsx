import { Accordion } from 'components/UI';

import styles from './FiltertingSidebarParameters.module.scss';

export function FiltertingSidebarParameters() {
  return (
    <div className={styles.FiltertingSidebarParameters}>
      <Accordion title="Soil Properties" type="secondary">
        Soil Properties content
      </Accordion>
      <Accordion title="Soil Groups" type="secondary">
        Soil Groups content
      </Accordion>
      <Accordion title="Soil Depth" type="secondary">
        Soil Depth content
      </Accordion>
      <Accordion title="Horizon" type="secondary">
        Horizon content
      </Accordion>
    </div>
  );
}
