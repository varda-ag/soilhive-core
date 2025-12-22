import { Accordion } from 'components/UI';

import styles from './FilteringSidebarLandEcosystem.module.scss';

export function FilteringSidebarLandEcosystem() {
  return (
    <div className={styles.FilteringSidebarLandEcosystem}>
      <Accordion title="Agroecological zones" type="secondary">
        Agroecological zones content
      </Accordion>
      <Accordion title="Land Cover" type="secondary">
        Land Cover content
      </Accordion>
    </div>
  );
}
