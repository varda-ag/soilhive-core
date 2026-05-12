import { useEffect, useRef, useState, type RefObject } from 'react';
import { ConfirmPopup } from 'primereact/confirmpopup';
import CrossIcon from 'assets/icons/small-cross-icon.svg?react';
import FileIcon from 'assets/icons/small-file-icon.svg?react';
import { useTranslation } from 'react-i18next';

import styles from './DownloadsMenuItem.module.scss';

interface Props {
  progress: number;
  onCancel: () => void;
}

export function DownloadsMenuItem({ progress, onCancel }: Props) {
  const [confirmationVisible, setConfirmationVisible] = useState<boolean>(false);
  const cancelRef = useRef<HTMLElement | undefined>(undefined);
  const [targetEl, setTargetEl] = useState<HTMLElement | undefined>(undefined);
  const { t } = useTranslation('download');

  useEffect(() => {
    setTargetEl(cancelRef.current);
  }, []);

  return (
    <div data-testid="sh-downloads-menu-item" className={styles.DownloadsMenuItem}>
      <div className={styles.Left}>
        <FileIcon />
        {` ${t('downloads_status.extracting_data')}`}
      </div>
      <div className={styles.Right}>
        <span className={styles.Progress}>{progress} %</span>
        <button
          ref={cancelRef as RefObject<HTMLButtonElement>}
          data-testid="sh-downloads-menu-item-cancel"
          className={styles.CancelButton}
          aria-label={t('downloads_status.cancel')}
          onClick={() => setConfirmationVisible(true)}
        >
          <CrossIcon />
        </button>
        <ConfirmPopup
          target={targetEl}
          visible={confirmationVisible}
          appendTo="self"
          className={styles.ConfirmationPopup}
          rejectClassName={styles.ConfirmationPopupReject}
          acceptClassName={styles.ConfirmationPopupAccept}
          onHide={() => setConfirmationVisible(false)}
          message={t('downloads_status.cancel_download_confirm')}
          accept={onCancel}
        />
      </div>
    </div>
  );
}
