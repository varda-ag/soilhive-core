import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
// import BellIcon from 'assets/icons/bell-icon.svg?react';
import LogoutIcon from 'assets/icons/logout-icon.svg?react';
import { ADMIN_PATHS, PAGE_TITLE_KEYS } from '../../../configuration/admin';
import { useAuthContext } from '../../../auth/AuthContextProvider';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { Logo } from 'components/Logo/Logo';

import styles from './AdminHeader.module.scss';

export function AdminHeader() {
  const { user, logout } = useAuthContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('admin');

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  const titleKey = useMemo(() => {
    if (pathname.startsWith(ADMIN_PATHS.DATASETS)) return PAGE_TITLE_KEYS[ADMIN_PATHS.DATASETS];
    return PAGE_TITLE_KEYS[pathname];
  }, [pathname]);

  return (
    <header className={styles.AdminHeader}>
      <div className={styles.Left}>
        <Logo className={styles.Logo} />
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
