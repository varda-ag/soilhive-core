import { useMemo, useState, type ReactNode } from 'react';
import classnames from 'classnames';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';

import styles from './Accordion.module.scss';

type AccordionType = 'primary' | 'secondary';

interface Props {
  title: string;
  openedFromStart?: boolean;
  type?: AccordionType;
  children: ReactNode;
  pillsSlot?: ReactNode;
}

export function Accordion({ title, openedFromStart = false, type = 'primary', children, pillsSlot }: Props) {
  const [isOpened, setIsOpened] = useState<boolean>(openedFromStart);

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
      data-testid="sh-ui-accordion"
      className={classnames(styles.Accordion, typeClass, {
        [styles.Opened]: isOpened,
      })}
    >
      <div className={styles.Header} role="button" onClick={() => setIsOpened(!isOpened)}>
        <p className={styles.Title}>
          {title} <ArrowDownIcon className={styles.ArrowIcon} />
        </p>
      </div>
      {pillsSlot && <div className={styles.PillsContainer}>{pillsSlot}</div>}
      {isOpened && <div className={styles.Content}>{children}</div>}
    </div>
  );
}
