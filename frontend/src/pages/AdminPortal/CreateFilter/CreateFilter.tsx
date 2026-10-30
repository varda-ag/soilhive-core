import { useTranslation } from 'react-i18next';

import styles from './CreateFilter.module.scss';

export function CreateFilter() {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.CreateFilter}>
      <div className={styles.Section}>
        <h2 className={styles.Title}>{t('createFilter.title')}</h2>
        <p className={styles.Message}>{t('createFilter.message')}</p>
      </div>
    </div>
  );
}
