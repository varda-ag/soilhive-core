import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { Button } from 'components/UI';
import { useAuthContext } from '../../auth/AuthContextProvider';
import type { NavMenuEntry } from 'types/components';

import styles from './MobileMenu.module.scss';
import MobileDropdownMenuItem from './MobileDropdownMenuItem/MobileDropdownMenuItem';
import MenuLink from 'components/Header/MenuLink/MenuLink';

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

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, [setIsMenuOpen]);

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
            {menuEntries.map(item =>
              item.children ? (
                <MobileDropdownMenuItem key={item.name} menuEntry={item} onLinkClick={closeMenu} />
              ) : (
                <MenuLink
                  key={item.name}
                  to={`${item.route}`}
                  text={t(item.name)}
                  type={item.type}
                  className={styles.MobileLink}
                  iconClassName={styles.Icon}
                  textClassName={styles.LinkText}
                  Icon={item.Icon}
                  onClick={closeMenu}
                />
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
