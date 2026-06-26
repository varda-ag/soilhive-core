import { useCallback, useMemo, useState, useImperativeHandle, type ReactNode, type Ref } from 'react';
import classnames from 'classnames';
import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';

import styles from './Accordion.module.scss';
import type { AccordionRef } from 'types/components';

type AccordionType = 'primary' | 'secondary' | 'tertiary' | 'custom';

interface Props {
  ref?: Ref<AccordionRef>;
  title: string | ReactNode;
  className?: string;
  headerClassName?: string;
  headerOpenedClassName?: string;
  headerLeftContent?: string | ReactNode;
  openedFromStart?: boolean;
  type?: AccordionType;
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  children: ReactNode;
  pillsSlot?: ReactNode;
  onToggle?: (isOpened: boolean) => void;
}

export function Accordion({
  ref,
  title,
  className,
  headerClassName,
  headerOpenedClassName,
  headerLeftContent,
  openedFromStart = false,
  type = 'primary',
  Icon,
  children,
  pillsSlot,
  onToggle,
}: Props) {
  const [isOpened, setIsOpened] = useState<boolean>(openedFromStart);

  const typeClass = useMemo(
    () =>
      ({
        primary: styles.Primary,
        secondary: styles.Secondary,
        tertiary: styles.Tertiary,
        custom: styles.Custom,
      })[type],
    [type],
  );

  const handleOnToggle = useCallback(() => {
    setIsOpened(!isOpened);
    onToggle?.(!isOpened);
  }, [isOpened, onToggle]);

  useImperativeHandle(
    ref,
    () => ({
      expand() {
        setIsOpened(true);
      },

      collapse() {
        setIsOpened(false);
      },
    }),
    [],
  );

  return (
    <div
      data-testid="sh-ui-accordion"
      className={classnames(styles.Accordion, typeClass, className, {
        [styles.Opened]: isOpened,
      })}
    >
      <div
        className={classnames(styles.Header, headerClassName, !!headerOpenedClassName && isOpened && headerOpenedClassName)}
        role="button"
        onClick={handleOnToggle}
      >
        <div className={styles.Title}>
          {type === 'tertiary' && <ArrowDownIcon className={styles.ArrowIcon} />}
          {!!Icon && <Icon className={styles.Icon} />}
          {title}
          {type !== 'tertiary' && (
            <div className={styles.Left}>
              {headerLeftContent}
              <ArrowDownIcon className={styles.ArrowIcon} />
            </div>
          )}
        </div>
      </div>
      {pillsSlot && <div className={styles.PillsContainer}>{pillsSlot}</div>}
      <div className={styles.Content}>{children}</div>
    </div>
  );
}
