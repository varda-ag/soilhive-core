import { useMemo, useState } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';

import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';
import PlanetIcon from 'assets/icons/planet-icon.svg?react';
import ScalesIcon from 'assets/icons/scales-icon.svg?react';

import { singlePages } from '../../utilities/moduleFederation';
import MobileMenu from 'components/MobileMenu/MobileMenu';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import { AccountWidget } from 'components/AccountWidget/AccountWidget';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';
import { Logo } from 'components/Logo/Logo';
import { useAuthContext } from '../../auth/AuthContextProvider';
import useTheme from 'hooks/useTheme';
import useDevice from 'hooks/useDevice';
import type { NavMenuEntry } from 'types/components';

import styles from './Header.module.scss';

export default function Header() {
  const { t } = useTranslation('common');
  const { isDesktopLayout } = useDevice();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const { isLoadingThemeConfig, themeConfig } = useTheme();

  const menuEntries: NavMenuEntry[] = useMemo(() => {
    const output = [
      {
        name: 'nav_menu.home',
        route: '/',
        type: 'internal',
        Icon: PlanetIcon,
      } as NavMenuEntry,
    ];
    if (!isLoadingThemeConfig && !!themeConfig.termsAndConditionsHtml) {
      output.push({ name: 'nav_menu.legal', route: '/legal', type: 'internal', Icon: ScalesIcon });
    }
    return output;
  }, [isLoadingThemeConfig, themeConfig.termsAndConditionsHtml]);

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? `${styles.Active}` : '';
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className={styles.Header}>
        <Logo />
        <div className={styles.Menu}>
          {isDesktopLayout && (
            <nav data-testid="sh-header-nav" className={styles.Nav}>
              {menuEntries.map(({ name, route }) => (
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
