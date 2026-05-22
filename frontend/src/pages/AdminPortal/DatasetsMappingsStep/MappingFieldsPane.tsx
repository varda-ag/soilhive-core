import { useTranslation } from 'react-i18next';
import CloudSync from 'assets/images/cloud-sync.svg?react';
import styles from './MappingFieldsPane.module.scss';

export function MappingFieldsPane() {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.MappingFieldsPane}>
      <CloudSync className={styles.Icon} />
      <h2 className={styles.Title}>{t('datasets.mappings.importing.title')}</h2>
      <p className={styles.Description}>{t('datasets.mappings.importing.description_1')}</p>
      <p className={styles.Description}>{t('datasets.mappings.importing.description_2')}</p>
    </div>
  );
}
