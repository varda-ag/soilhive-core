import { useMemo, type ReactNode } from 'react';
import classnames from 'classnames';

import styles from './PageSidebar.module.scss';

interface Props {
  isOpened: boolean;
  className?: string;
  children: ReactNode;
  position: 'right' | 'left';
}

export function PageSidebar({ className, isOpened, children, position }: Props) {
  const positionClass = useMemo(
    () =>
      ({
        right: styles.Right,
        left: styles.Left,
      })[position],
    [position],
  );

  return (
    <div
      data-testid="sh-ui-page-sidebar"
      className={classnames(styles.PageSidebar, positionClass, className, { [styles.Opened]: isOpened })}
    >
      {children}
    </div>
  );
}
