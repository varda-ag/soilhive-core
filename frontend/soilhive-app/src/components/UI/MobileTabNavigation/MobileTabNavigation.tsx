import classnames from 'classnames';
import type { MobileTabNavigationConfig } from 'types/components';

import styles from './MobileTabNavigation.module.scss';

type Props = {
  config: MobileTabNavigationConfig[];
  active: string;
  onChange: (id: string) => void;
};

export function MobileTabNavigation({ config, active, onChange }: Props) {
  return (
    <div data-testid="sh-ui-mobile-tab-navigation" className={styles.MobileTabNavigation}>
      {config.map(({ name, id, Icon }) => (
        <div
          key={id}
          data-testid="sh-ui-mobile-tab-navigation-item"
          className={classnames(styles.MobileTabNavigationItem, {
            [styles.Active]: active === id,
          })}
          role="button"
          onClick={() => onChange(id)}
        >
          {!!Icon && <Icon />} {name}
        </div>
      ))}
    </div>
  );
}
