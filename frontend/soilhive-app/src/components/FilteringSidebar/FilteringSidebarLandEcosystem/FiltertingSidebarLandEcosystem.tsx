import { Accordion } from 'components/UI';

import styles from './FiltertingSidebarLandEcosystem.module.scss';

export function FiltertingSidebarLandEcosystem() {
  return (
    <div className={styles.FiltertingSidebarLandEcosystem}>
      <Accordion title="Agroecological zones" type="secondary">
        Agroecological zones content
      </Accordion>
      <Accordion title="Land Cover" type="secondary">
        Land Cover content
      </Accordion>
    </div>
  );
}
