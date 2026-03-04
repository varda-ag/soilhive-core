import { useEffect, useRef, useState, type RefObject } from 'react';
import { ConfirmPopup } from 'primereact/confirmpopup';
import CrossIcon from 'assets/icons/small-cross-icon.svg?react';
import FileIcon from 'assets/icons/small-file-icon.svg?react';

import styles from './DownloadsMenuItem.module.scss';

interface Props {
  progress: number;
  onCancel: () => void;
}

export function DownloadsMenuItem({ progress, onCancel }: Props) {
  const [confirmationVisible, setConfirmationVisible] = useState<boolean>(false);
  const cancelRef = useRef<HTMLElement | undefined>(undefined);
  const [targetEl, setTargetEl] = useState<HTMLElement | undefined>(undefined);

  useEffect(() => {
    setTargetEl(cancelRef.current);
  }, []);

  return (
    <div data-testid="sh-downloads-menu-item" className={styles.DownloadsMenuItem}>
      <div className={styles.Left}>
        <FileIcon /> Extracting data
      </div>
      <div className={styles.Right}>
        <span className={styles.Progress}>{progress} %</span>
        <button
          ref={cancelRef as RefObject<HTMLButtonElement>}
          data-testid="sh-downloads-menu-item-cancel"
          className={styles.CancelButton}
          aria-label="Cancel"
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
          message="Do you want to cancel the download?"
          accept={onCancel}
        />
      </div>
    </div>
  );
}
