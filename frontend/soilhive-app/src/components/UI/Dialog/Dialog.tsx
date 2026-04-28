import { useMemo, type ReactNode, type RefObject } from 'react';
import classnames from 'classnames';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { useTranslation } from 'react-i18next';

import CloseIcon from 'assets/icons/cross-icon.svg?react';
import styles from './Dialog.module.scss';
import { Button } from '../Button/Button';

interface Props {
  visible: boolean;
  header: string;
  removeTransition?: boolean;
  primaryText?: string;
  secondaryText?: string;
  className?: string;
  contentClassName?: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onClose?: () => void;
  children: ReactNode;
}

export function Dialog({
  visible,
  header,
  secondaryText,
  primaryText,
  removeTransition,
  className,
  contentClassName,
  onPrimary,
  onSecondary,
  onClose,
  children,
}: Props) {
  const { t } = useTranslation('common');

  const conditionalProps = useMemo(() => {
    const props: Record<string, any> = {};

    if (removeTransition) {
      props.transitionOptions = { timeout: 0 };
    }

    return props;
  }, [removeTransition]);

  return (
    <ConfirmDialog
      group="headless"
      visible={visible}
      className={classnames(styles.Dialog, className)}
      {...conditionalProps}
      content={({ contentRef, headerRef, footerRef }) => (
        <>
          <div className={styles.Header} ref={headerRef as RefObject<HTMLDivElement>}>
            {header}
            <button className={styles.CloseButton} onClick={onClose ?? onSecondary} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className={classnames(styles.Content, contentClassName)} ref={contentRef as RefObject<HTMLDivElement>}>
            {children}
          </div>
          <div className={styles.Footer} ref={footerRef as RefObject<HTMLDivElement>}>
            {!!secondaryText && (
              <Button className={styles.Button} type="secondary" onClick={onSecondary}>
                {secondaryText}
              </Button>
            )}
            <Button className={styles.Button} onClick={onPrimary}>
              {primaryText || t('dialog.continue')}
            </Button>
          </div>
        </>
      )}
    />
  );
}
