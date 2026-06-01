import { type CSSProperties, useMemo } from 'react';
import classnames from 'classnames';
import type { MobileTabNavigationConfig } from 'types/components';

import styles from './MobileTabNavigation.module.scss';

type MobileTabNavigationType = 'primary' | 'secondary';
type MobileTabNavigationFontSize = 'base' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | '2lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

type Props = {
  config: MobileTabNavigationConfig[];
  type?: MobileTabNavigationType;
  fontSize?: MobileTabNavigationFontSize;
  active: string;
  className?: string;
  onChange: (id: string) => void;
};

export function MobileTabNavigation({ config, type = 'primary', fontSize = 'xs', active, className, onChange }: Props) {
  const typeClass = useMemo(
    () =>
      ({
        primary: styles.Primary,
        secondary: styles.Secondary,
      })[type],
    [type],
  );

  return (
    <div
      data-testid="sh-ui-mobile-tab-navigation"
      className={classnames(styles.MobileTabNavigation, typeClass, className)}
      style={{ '--tab-font-size': `var(--font-size-${fontSize})` } as CSSProperties}
    >
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
