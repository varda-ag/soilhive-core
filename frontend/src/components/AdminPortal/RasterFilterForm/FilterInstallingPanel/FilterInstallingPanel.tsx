import { useTranslation } from 'react-i18next';

import CloudWifiIcon from 'assets/icons/cloud-wifi.svg?react';
import { ProgressBar } from 'components/UI';

import styles from './FilterInstallingPanel.module.scss';

interface Props {
  // Undefined while the install is still queued
  progress?: number;
}

export function FilterInstallingPanel({ progress }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.Panel} data-testid="sh-filter-installing-panel">
      <CloudWifiIcon />
      <h2 className={styles.Title}>{t('createFilter.installing.title')}</h2>
      <p className={styles.Description}>{t('createFilter.installing.description')}</p>
      {progress !== undefined && (
        <div className={styles.Progress}>
          <ProgressBar progress={[progress]} />
          <span className={styles.Percentage}>{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
}
