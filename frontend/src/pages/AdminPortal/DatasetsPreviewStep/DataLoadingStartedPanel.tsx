import { useTranslation } from 'react-i18next';

import CloudWifiIcon from 'assets/icons/cloud-wifi.svg?react';
import { Button } from 'components/UI';
import styles from './DataLoadingStartedPanel.module.scss';

interface Props {
  onContinue: () => void;
}

export function DataLoadingStartedPanel({ onContinue }: Props) {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.Panel}>
      <CloudWifiIcon />
      <h2 className={styles.Title}>{t('datasets.preview.data_loading.title')}</h2>
      <p className={styles.Description}>{t('datasets.preview.data_loading.description')}</p>
      <Button type="primary" onClick={onContinue}>
        {t('datasets.actions.continue')}
      </Button>
    </div>
  );
}
