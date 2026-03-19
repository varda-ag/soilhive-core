import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { Button } from 'components/UI';
import { useAuthContext } from '../../auth/AuthContextProvider';
import type { NavMenuEntry } from 'types/components';

import styles from './MobileMenu.module.scss';

type MobileMenuProps = {
  menuEntries: NavMenuEntry[];
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export default function MobileMenu({ menuEntries, setIsMenuOpen }: MobileMenuProps) {
  const { t } = useTranslation('common');
  const { isAuthenticated, user, logout } = useAuthContext();

  const displayName = useMemo(() => {
    return user?.profile?.name || user?.profile?.email;
  }, [user]);

  return (
    <div className={styles.MobileMenu}>
      <div className={styles.Top}>
        {isAuthenticated && (
          <div className={styles.AccountInformation}>
            <div className={styles.AccountContent}>
              <UserAvatar className={styles.ProfilePicture} />
              <div className={styles.UserInfo}>
                {displayName && <p className={styles.Name}>{displayName}</p>}
                <p className={styles.Email}>{user?.profile?.email}</p>
              </div>
            </div>
          </div>
        )}
        <nav className={styles.Nav}>
          <div className={styles.NavContent}>
            {menuEntries.map(({ name, route, type, Icon }) =>
              type === 'internal' ? (
                <NavLink key={route} to={route} className={styles.MobileLink} onClick={() => setIsMenuOpen(false)}>
                  {Icon && <Icon className={styles.Icon} />}
                  <span className={styles.LinkText}>{t(name)}</span>
                </NavLink>
              ) : (
                <a className={styles.MobileLink} key={route} href={route} target="_blank" rel="noopener noreferrer">
                  {Icon && <Icon className={styles.Icon} />}
                  <span className={styles.LinkText}>{t(name)}</span>
                </a>
              ),
            )}
          </div>
        </nav>
      </div>
      {isAuthenticated && (
        <div className={styles.Footer}>
          <Button type="secondary" onClick={logout}>
            {t('auth.logout')}
          </Button>
        </div>
      )}
    </div>
  );
}
