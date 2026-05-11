import classnames from 'classnames';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { DownloadsMenuItem } from './DownloadsMenuItem/DownloadsMenuItem';
import useDownloads from 'hooks/useDownloads';
import { useTranslation } from 'react-i18next';

import styles from './DownloadsMenu.module.scss';

export function DownloadsMenu({ className }: { className?: string }) {
  const { downloads, cancelDownload } = useDownloads();
  const { t } = useTranslation('download');

  return (
    <div data-testid="sh-downloads-menu" className={classnames(styles.DownloadsMenu, className)}>
      <div className={styles.Header}>
        <DownloadIcon /> {downloads.length}
        {` ${t('downloads_status.downloads_in_progress')}`}
      </div>
      <div className={styles.Body}>
        <div className={styles.DownloadsList}>
          {downloads.map(item => (
            <DownloadsMenuItem key={item.id} progress={item.progress} onCancel={() => cancelDownload(item.id)} />
          ))}
        </div>
        <p className={styles.Message}>{t('downloads_status.extraction_message')}</p>
      </div>
    </div>
  );
}
