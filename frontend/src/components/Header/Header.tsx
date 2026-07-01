import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';
import PlanetIcon from 'assets/icons/planet-icon.svg?react';
import ScalesIcon from 'assets/icons/scales-icon.svg?react';
import AwardIcon from 'assets/icons/award-icon.svg?react';
import LockIcon from 'assets/icons/lock-icon.svg?react';

import MobileMenu from 'components/MobileMenu/MobileMenu';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import { AccountWidget } from 'components/AccountWidget/AccountWidget';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';
import { Logo } from 'components/Logo/Logo';
import { useAuthContext } from '../../auth/AuthContextProvider';
import useTheme from 'hooks/useTheme';
import useRemotes from 'hooks/useRemotes';
import useDevice from 'hooks/useDevice';
import { isNewTabModule, isSinglePageModule } from 'utilities/moduleFederation';
import type { NavMenuEntry } from 'types/components';
import DropdownMenuItem from './DropdownMenuItem/DropdownMenuItem';
import MenuLink from './MenuLink/MenuLink';

import styles from './Header.module.scss';

export default function Header() {
  const { t } = useTranslation('common');
  const { isDesktopLayout, isMobileLayout } = useDevice();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isAuthenticated } = useAuthContext();
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  const { plugins } = useRemotes();
  const singlePages = useMemo(() => plugins.filter(isSinglePageModule), [plugins]);
  const newTabs = useMemo(() => plugins.filter(isNewTabModule), [plugins]);

  // Plugin menu items, as nav entries so desktop and mobile render them identically.
  const pluginEntries: NavMenuEntry[] = useMemo(
    () => [
      ...singlePages.map(({ route, name }): NavMenuEntry => ({ name, route, type: 'internal' })),
      ...newTabs.map(({ targetUrl, name }): NavMenuEntry => ({ name, route: targetUrl, type: 'external' })),
    ],
    [singlePages, newTabs],
  );

  const menuEntries: NavMenuEntry[] = useMemo(() => {
    const output = [
      {
        name: 'nav_menu.home',
        route: '/',
        type: 'internal',
        Icon: PlanetIcon,
      } as NavMenuEntry,
    ];

    // Adding plugins after Home
    output.push(...pluginEntries);

    if (!isLoadingThemeConfig && (themeConfig.termsAndConditionsHtml || themeConfig.privacyPolicyHtml)) {
      const children: NavMenuEntry[] = [];

      if (themeConfig.termsAndConditionsHtml) {
        children.push({ name: 'nav_menu.terms', route: '/terms-of-use', type: 'internal', Icon: AwardIcon });
      }

      if (themeConfig.privacyPolicyHtml) {
        children.push({ name: 'nav_menu.privacy_policy', route: '/privacy-policy', type: 'internal', Icon: LockIcon });
      }

      output.push({
        name: 'nav_menu.legal',
        type: 'internal',
        Icon: ScalesIcon,
        children,
      });
    }

    return output;
  }, [pluginEntries, isLoadingThemeConfig, themeConfig.termsAndConditionsHtml, themeConfig.privacyPolicyHtml]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className={styles.Header}>
        <Logo />
        <div className={styles.BetaPill}>{t(isMobileLayout ? 'nav_menu.beta' : 'nav_menu.beta_version')}</div>
        <div className={styles.Menu}>
          {isDesktopLayout && (
            <nav data-testid="sh-header-nav" className={styles.Nav}>
              {menuEntries.map(item =>
                item.children ? (
                  <DropdownMenuItem key={item.name} menuEntry={item} />
                ) : (
                  <MenuLink
                    key={item.name}
                    to={`${item.route}`}
                    text={t(item.name)}
                    type={item.type}
                    activeClassName={styles.Active}
                    textClassName={styles.LinkText}
                  />
                ),
              )}
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
