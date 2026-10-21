import { useEffect, useRef, useState, type RefObject } from 'react';
import { ConfirmPopup } from 'primereact/confirmpopup';
import CrossIcon from 'assets/icons/small-cross-icon.svg?react';
import FileIcon from 'assets/icons/small-file-icon.svg?react';
import SmallDownloadIcon from 'assets/icons/small-download-icon.svg?react';
import WarningIcon from 'assets/icons/small-warning-icon.svg?react';
import { useTranslation } from 'react-i18next';
import type { DownloadsItem } from '../../../../contexts/DownloadsContext';

import styles from './DownloadsMenuItem.module.scss';

interface Props {
  item: DownloadsItem;
  onCancel: () => void;
  onDownload: () => void;
  onRemove: () => void;
}

export function DownloadsMenuItem({ item, onCancel, onDownload, onRemove }: Props) {
  const [confirmationVisible, setConfirmationVisible] = useState<boolean>(false);
  const cancelRef = useRef<HTMLElement | undefined>(undefined);
  const [targetEl, setTargetEl] = useState<HTMLElement | undefined>(undefined);
  const { t, i18n } = useTranslation('download');

  useEffect(() => {
    setTargetEl(cancelRef.current);
  }, []);

  const createdAt = new Date(item.createdAt).toLocaleString(i18n.resolvedLanguage, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const details = [
    item.formats.map(format => format.toUpperCase()).join(', '),
    t('downloads_status.datasets_count', { count: item.datasetCount }),
  ].join(' · ');

  return (
    <div data-testid="sh-downloads-menu-item" data-status={item.status} className={styles.DownloadsMenuItem}>
      <div className={styles.Left}>
        <FileIcon className={styles.FileIcon} />
        <div className={styles.Label}>
          <span className={styles.Time}>{createdAt}</span>
          <span className={styles.Details}>{details}</span>
          {item.status === 'failed' && (
            <span data-testid="sh-downloads-menu-item-error" className={styles.Error}>
              <WarningIcon className={styles.ErrorIcon} />
              {item.message ?? t('downloads_status.export_failed')}
            </span>
          )}
        </div>
      </div>
      <div className={styles.Right}>
        {item.status === 'completed' && (
          <button
            data-testid="sh-downloads-menu-item-download"
            className={styles.IconButton}
            aria-label={t('downloads_status.download')}
            onClick={onDownload}
          >
            <SmallDownloadIcon />
          </button>
        )}
        {item.status === 'completed' || item.status === 'failed' ? (
          <button
            data-testid="sh-downloads-menu-item-remove"
            className={styles.IconButton}
            aria-label={t('downloads_status.remove')}
            onClick={onRemove}
          >
            <CrossIcon />
          </button>
        ) : (
          <>
            <span className={styles.Progress}>{item.progress} %</span>
            <button
              ref={cancelRef as RefObject<HTMLButtonElement>}
              data-testid="sh-downloads-menu-item-cancel"
              className={styles.IconButton}
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
          </>
        )}
      </div>
    </div>
  );
}
