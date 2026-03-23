import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
// import BellIcon from 'assets/icons/bell-icon.svg?react';
import LogoutIcon from 'assets/icons/logout-icon.svg?react';
import useTheme from 'hooks/useTheme';
import { PAGE_TITLE_KEYS } from '../../../configuration/admin';
import { useAuthContext } from '../../../auth/AuthContextProvider';

import styles from './AdminHeader.module.scss';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';

export function AdminHeader() {
  const { user, logout } = useAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const { logo } = useTheme();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

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
        {/* <div className={styles.Notifications}>
          <BellIcon />
        </div> */}
        <div className={styles.User}>
          {user?.profile?.email && <span className={styles.UserName}>{user.profile.email}</span>}
          <UserAvatar />
        </div>
        <div className={styles.LogoutWrapper}>
          <div data-testid="sh-header-logout" className={styles.Logout} onClick={handleLogout}>
            <LogoutIcon />
          </div>
        </div>
      </div>
    </header>
  );
}
