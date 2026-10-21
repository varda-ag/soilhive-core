import classnames from 'classnames';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { DownloadsMenuItem } from './DownloadsMenuItem/DownloadsMenuItem';
import useDownloads from 'hooks/useDownloads';
import { isJobFinished } from 'types/jobs';
import { useTranslation } from 'react-i18next';

import styles from './DownloadsMenu.module.scss';

export function DownloadsMenu({ className }: { className?: string }) {
  const { downloads, cancelDownload, downloadBundle, removeDownload, clearFinished } = useDownloads();
  const { t } = useTranslation('download');

  const hasFinished = downloads.some(item => isJobFinished(item.status));
  const hasRunning = downloads.some(item => !isJobFinished(item.status));

  return (
    <div data-testid="sh-downloads-menu" className={classnames(styles.DownloadsMenu, className)}>
      <div className={styles.Header}>
        <DownloadIcon /> {t('downloads_status.downloads')}
        {hasFinished && (
          <button data-testid="sh-downloads-menu-clear" className={styles.ClearButton} onClick={clearFinished}>
            {t('downloads_status.clear_finished')}
          </button>
        )}
      </div>
      <div className={styles.Body}>
        <div className={styles.DownloadsList}>
          {downloads.map(item => (
            <DownloadsMenuItem
              key={item.id}
              item={item}
              onCancel={() => cancelDownload(item.id)}
              onDownload={() => downloadBundle(item.id)}
              onRemove={() => removeDownload(item.id)}
            />
          ))}
        </div>
        {hasRunning && <p className={styles.Message}>{t('downloads_status.extraction_message')}</p>}
      </div>
    </div>
  );
}
