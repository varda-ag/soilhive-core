import { useMemo } from 'react';
import classnames from 'classnames';
import type { MobileTabNavigationConfig } from 'types/components';

import styles from './MobileTabNavigation.module.scss';

type MobileTabNavigationType = 'primary' | 'secondary';
type Props = {
  config: MobileTabNavigationConfig[];
  type?: MobileTabNavigationType;
  active: string;
  className?: string;
  onChange: (id: string) => void;
};

export function MobileTabNavigation({ config, type = 'primary', active, className, onChange }: Props) {
  const typeClass = useMemo(
    () =>
      ({
        primary: styles.Primary,
        secondary: styles.Secondary,
      })[type],
    [type],
  );

  return (
    <div data-testid="sh-ui-mobile-tab-navigation" className={classnames(styles.MobileTabNavigation, typeClass, className)}>
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
