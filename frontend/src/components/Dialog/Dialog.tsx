import { useCallback, useMemo, type ReactNode, type RefObject, type MouseEvent } from 'react';
import classnames from 'classnames';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { useTranslation } from 'react-i18next';

import CloseIcon from 'assets/icons/cross-icon.svg?react';
import styles from './Dialog.module.scss';
import { Button } from '../UI/Button/Button';
import { Loader } from '../UI/Loader/Loader';

interface Props {
  visible: boolean;
  // Without one, the dialog has no title bar nor close button: Esc, the secondary button or the overlay close it
  header?: ReactNode;
  removeTransition?: boolean;
  primaryText?: string;
  secondaryText?: string;
  className?: string;
  ariaLabel?: string;
  contentClassName?: string;
  headerClassName?: string;
  hideButtons?: boolean;
  closeOnOverlay?: boolean;
  // Shows a loader and locks the dialog until the action started from it finishes
  isLoading?: boolean;
  onPrimary?: () => void;
  onSecondary?: () => void;
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
  ariaLabel,
  contentClassName,
  headerClassName,
  hideButtons = false,
  closeOnOverlay = false,
  isLoading = false,
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

    if (ariaLabel) {
      props['aria-label'] = ariaLabel;
    }

    return props;
  }, [removeTransition, ariaLabel]);

  const onMaskClick = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!isLoading && target && target.classList.contains('p-dialog-mask')) {
        onClose?.();
      }
    },
    [isLoading, onClose],
  );

  // PrimeReact calls onHide on Esc but also after every close it is told about: only the first is still visible
  const onHide = useCallback(() => {
    if (visible && !isLoading) (onClose ?? onSecondary)?.();
  }, [visible, isLoading, onClose, onSecondary]);

  return (
    <ConfirmDialog
      group="headless"
      visible={visible}
      className={classnames(styles.Dialog, className)}
      {...conditionalProps}
      onHide={onHide}
      onMaskClick={closeOnOverlay ? onMaskClick : undefined}
      content={({ contentRef, headerRef, footerRef }) => (
        <>
          {header !== undefined && (
            <div className={classnames(styles.Header, headerClassName)} ref={headerRef as RefObject<HTMLDivElement>}>
              {header}
              <button
                className={styles.CloseButton}
                onClick={onClose ?? onSecondary}
                disabled={isLoading}
                aria-label={t('dialog.close_aria')}
              >
                <CloseIcon />
              </button>
            </div>
          )}
          <div className={classnames(styles.Content, contentClassName)} ref={contentRef as RefObject<HTMLDivElement>}>
            {children}
          </div>
          {!hideButtons && (
            <div className={styles.Footer} ref={footerRef as RefObject<HTMLDivElement>}>
              {!!secondaryText && (
                <Button className={styles.Button} type="secondary" isDisabled={isLoading} onClick={onSecondary}>
                  {secondaryText}
                </Button>
              )}
              <Button className={styles.Button} isDisabled={isLoading} onClick={onPrimary}>
                {primaryText || t('dialog.continue')}
              </Button>
            </div>
          )}
          {isLoading && <Loader />}
        </>
      )}
    />
  );
}
