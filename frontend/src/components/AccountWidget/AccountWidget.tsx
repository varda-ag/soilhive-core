import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useClickAway } from 'react-use';

import LogoutIcon from 'assets/icons/logout-icon.svg?react';
// Should be here for Profile menu
// import UserIcon from 'assets/icons/user-icon.svg?react';
import SettingsIcon from 'assets/icons/settings-icon.svg?react';
import { useAuthContext } from '../../auth/AuthContextProvider';
import { UserAvatar } from './UserAvatar/UserAvatar';

import styles from './AccountWidget.module.scss';
import { ADMIN_ROOT } from '../../configuration/admin';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';
import { LoginButton } from './LoginButton/LoginButton';

export function AccountWidget() {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, user, authMode, isLoading, logout } = useAuthContext();
  const { can } = useEntitlements();

  const widgetRef = useRef(null);
  const { t } = useTranslation('common');

  const displayName = useMemo(() => {
    return user?.profile?.name || user?.profile?.email;
  }, [user]);

  useClickAway(widgetRef, () => isMenuOpen && setMenuOpen(false), ['click']);

  if (authMode === 'none' || isLoading) return null;

  if (!isAuthenticated) return <LoginButton />;

  return (
    <div data-testid="sh-ui-accountwidget" className={styles.AccountWidget} ref={widgetRef}>
      <div data-testid="sh-ui-accountwidgetbutton" className={styles.WidgetButton} onClick={() => setMenuOpen(!isMenuOpen)}>
        <UserAvatar />
      </div>
      {isMenuOpen && (
        <div className={styles.OptionsMenu}>
          <div className={styles.AccountInformation}>
            <UserAvatar className={styles.ProfilePicture} />
            <div className={styles.UserInfo}>
              {displayName && <p className={styles.Name}>{displayName}</p>}
              <p className={styles.Email}>{user?.profile?.email}</p>
            </div>
          </div>
          <div className={styles.Options}>
            {/* Should be here for Profile menu */}
            {/* <a className={styles.Option} href={'#'} target="_blank" rel="noopener noreferrer">
              <UserIcon />
              {t('user_menu.my_account')}
            </a> */}
            {can(ADMIN_PORTAL_ACCESS) && (
              <a className={styles.Option} href={ADMIN_ROOT} target="_blank" rel="noopener noreferrer">
                <SettingsIcon />
                {t('user_menu.admin_panel')}
              </a>
            )}
            <div className={styles.Option} onClick={logout}>
              <LogoutIcon />
              {t('auth.logout')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
