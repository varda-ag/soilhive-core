import { useTranslation } from 'react-i18next';
import { UploadLogo } from 'components/AdminPortal/LookAndFeel/UploadLogo/UploadLogo';

import styles from './LogoTab.module.scss';

export function LogoTab() {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.LogoTab}>
      <h2 className={styles.Title}>{t('look_and_feel.logo.title')}</h2>
      <UploadLogo />
    </div>
  );
}
