import { ColorsSettingsSection } from '../ColorsSettingsSection/ColorsSettingsSection';
import { colorsSettingsConfig } from '../../../../configuration/colors';
import type { ColorsConfigSection } from 'types/config';

import styles from './ColorsSettings.module.scss';

export function ColorsSettings() {
  return (
    <div className={styles.ColorsSettings}>
      {colorsSettingsConfig.map((section: ColorsConfigSection) => (
        <ColorsSettingsSection key={section.name} {...section} />
      ))}
    </div>
  );
}
