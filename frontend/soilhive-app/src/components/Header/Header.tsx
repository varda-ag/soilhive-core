import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';

import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';
import PlanetIcon from 'assets/icons/planet-icon.svg?react';
import SettingsIcon from 'assets/icons/settings-icon.svg?react';
import ScalesIcon from 'assets/icons/scales-icon.svg?react';
import MobileMenu from 'components/MobileMenu/MobileMenu';

import { singlePages } from '../../utilities/moduleFederation';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import { AccountWidget } from 'components/AccountWidget/AccountWidget';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';
import { useAuthContext } from '../../auth/AuthContextProvider';
import useTheme from 'hooks/useTheme';
import { ADMIN_PORTAL_ACCESS, useEntitlements } from 'hooks/useEntitlementsHook';
import useDevice from 'hooks/useDevice';
import { ADMIN_ROOT } from '../../configuration/admin';
import type { NavMenuEntry } from 'types/components';

import styles from './Header.module.scss';
export default function Header() {
  const { t } = useTranslation('common');
  const { isDesktopLayout } = useDevice();
  const { logo } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const { can } = useEntitlements();

  const menuEntries = useMemo<NavMenuEntry[]>(() => {
    const items: NavMenuEntry[] = [
      {
        name: 'nav_menu.availability',
        route: '/',
        type: 'internal',
        Icon: PlanetIcon,
      },
    ];

    if (can(ADMIN_PORTAL_ACCESS)) {
      items.push({
        name: 'nav_menu.admin',
        route: ADMIN_ROOT,
        type: 'external',
        Icon: SettingsIcon,
      });
    }
    items.push(
      { name: 'nav_menu.legal', route: '/legal', type: 'internal', Icon: ScalesIcon },
      { name: 'nav_menu.adminold', route: '/admin', type: 'internal' },
    );

    return items;
  }, [can]);

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? `${styles.Active}` : '';
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className={styles.Header}>
        <div data-testid="sh-header-logo" className={styles.Logo}>
          {logo && <img src={logo} alt={t('logo')} />}
        </div>
        <div className={styles.Menu}>
          {isDesktopLayout && (
            <nav data-testid="sh-header-nav" className={styles.Nav}>
              {menuEntries
                .filter(({ type }) => type === 'internal')
                .map(({ name, route }) => (
                  <NavLink data-testid="sh-header-nav-link" key={route} to={`${route}`} className={getNavLinkClass}>
                    <span className={styles.LinkText}>{t(name)}</span>
                  </NavLink>
                ))}

              {singlePages.map(({ route, name }) => (
                <NavLink data-testid="sh-header-nav-link" key={route} to={`/${route}`} className={getNavLinkClass}>
                  <span className={styles.LinkText}>{name}</span>
                </NavLink>
              ))}
            </nav>
          )}
          <div className={styles.Additional}>
            <DownloadsStatus />
            {isDesktopLayout && <AccountWidget />}
          </div>
        </div>

        {!isDesktopLayout && (
          <>
            {!isAuthenticated && <LoginButton />}
            {isAuthenticated && <UserAvatar className={styles.MobileAvatar} />}
            <button
              data-testid="sh-header-hamburger"
              className={styles.Hamburger}
              aria-label={t('nav_menu.hamburger_aria')}
              onClick={toggleMenu}
            >
              {isMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
            </button>
          </>
        )}
      </header>
      {!isDesktopLayout && isMenuOpen && <MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen} />}
    </>
  );
}
