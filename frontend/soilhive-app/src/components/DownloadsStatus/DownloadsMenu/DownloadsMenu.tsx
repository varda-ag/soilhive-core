import classnames from 'classnames';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { DownloadsMenuItem } from './DownloadsMenuItem/DownloadsMenuItem';
import useDownloads from 'hooks/useDownloads';

import styles from './DownloadsMenu.module.scss';

export function DownloadsMenu({ className }: { className?: string }) {
  const { downloads, cancelDownload } = useDownloads();

  return (
    <div data-testid="sh-downloads-menu" className={classnames(styles.DownloadsMenu, className)}>
      <div className={styles.Header}>
        <DownloadIcon /> {downloads.length} downloads in progress
      </div>
      <div className={styles.Body}>
        <div className={styles.DownloadsList}>
          {downloads.map(item => (
            <DownloadsMenuItem key={item.id} progress={item.progress} onCancel={() => cancelDownload(item.id)} />
          ))}
        </div>
        <p className={styles.Message}>After extraction, data will be saved to your downloads folder.</p>
      </div>
    </div>
  );
}
