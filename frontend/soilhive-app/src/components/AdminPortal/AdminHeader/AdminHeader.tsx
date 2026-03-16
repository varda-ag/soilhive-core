import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import BellIcon from 'assets/icons/bell-icon.svg?react';
import useTheme from 'hooks/useTheme';
import { PAGE_TITLE_KEYS } from '../../../configuration/admin';

import styles from './AdminHeader.module.scss';

export function AdminHeader() {
  const { pathname } = useLocation();
  const { t } = useTranslation('admin');
  const { logo } = useTheme();

  const titleKey = useMemo(() => PAGE_TITLE_KEYS[pathname], [pathname]);

  return (
    <header className={styles.AdminHeader}>
      <div className={styles.Left}>
        <div data-testid="sh-header-logo" className={styles.Logo}>
          {logo && <img src={logo} alt={t('logoAlt')} />}
        </div>
        <div className={styles.TitleWrapper}>
          <h1 className={styles.Title}>{t(titleKey)}</h1>
        </div>
      </div>
      <div className={styles.Right}>
        <div className={styles.Notifications}>
          <BellIcon />
        </div>
        <div className={styles.User}>
          <span className={styles.UserName}>marty.mcfly@comg.org</span>
          <div className={styles.UserAvatar}>mm</div>
        </div>
      </div>
    </header>
  );
}
