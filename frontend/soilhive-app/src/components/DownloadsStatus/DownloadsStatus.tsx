import { useRef, useState } from 'react';
import { useClickAway } from 'react-use';
import DownloadIcon from 'assets/icons/download-icon.svg?react';
import { DownloadsMenu } from './DownloadsMenu/DownloadsMenu';
import useDownloads from 'hooks/useDownloads';
import { useTranslation } from 'react-i18next';

import styles from './DownloadsStatus.module.scss';

export function DownloadsStatus() {
  const [isOpened, setIsOpened] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation('download');

  const { downloads } = useDownloads();

  useClickAway(rootRef, () => {
    setIsOpened(false);
  });

  if (!downloads.length) return null;

  return (
    <div ref={rootRef} data-testid="sh-downloads-status" className={styles.DownloadsStatus}>
      <button
        data-testid="sh-downloads-status-button"
        className={styles.DownloadsStatusButton}
        aria-label={t('downloads_status.downloads')}
        onClick={() => setIsOpened(prev => !prev)}
      >
        <span className={styles.Pulse} data-open={isOpened ? 'true' : 'false'} aria-hidden />
        <DownloadIcon className={styles.DownloadIcon} />
        <span className={styles.Counter}>{downloads.length}</span>
      </button>
      {isOpened && <DownloadsMenu className={styles.DownloadsMenu} />}
    </div>
  );
}
