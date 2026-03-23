import { type ReactNode, type RefObject } from 'react';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { useTranslation } from 'react-i18next';

import CloseIcon from 'assets/icons/cross-icon.svg?react';
import styles from './Dialog.module.scss';
import { Button } from '../Button/Button';

interface Props {
  visible: boolean;
  header: string;
  onContinue: () => void;
  onCancel: () => void;
  children: ReactNode;
}

export function Dialog({ visible, header, onContinue, onCancel, children }: Props) {
  const { t } = useTranslation('common');

  return (
    <ConfirmDialog
      group="headless"
      visible={visible}
      className={styles.Dialog}
      content={({ contentRef, headerRef, footerRef }) => (
        <>
          <div className={styles.Header} ref={headerRef as RefObject<HTMLDivElement>}>
            {header}
            <button className={styles.CloseButton} onClick={onCancel} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <div className={styles.Content} ref={contentRef as RefObject<HTMLDivElement>}>
            {children}
          </div>
          <div className={styles.Footer} ref={footerRef as RefObject<HTMLDivElement>}>
            <Button className={styles.ContinueButton} onClick={onContinue}>
              {t('dialog.continue')}
            </Button>
          </div>
        </>
      )}
    />
  );
}
