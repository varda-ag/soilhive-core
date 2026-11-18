import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';
import PlanetIcon from 'assets/icons/planet-icon.svg?react';
import ScalesIcon from 'assets/icons/scales-icon.svg?react';
import AwardIcon from 'assets/icons/award-icon.svg?react';
import LockIcon from 'assets/icons/lock-icon.svg?react';
import SettingsIcon from 'assets/icons/settings-icon.svg?react';

import MobileMenu from 'components/MobileMenu/MobileMenu';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import { AccountWidget } from 'components/AccountWidget/AccountWidget';
import { UserAvatar } from 'components/AccountWidget/UserAvatar/UserAvatar';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';
import { Logo } from 'components/Logo/Logo';
import { useCookieConsent } from 'components/CookieConsentProvider';
import { useAuthContext } from '../../auth/AuthContextProvider';
import useTheme from 'hooks/useTheme';
import useRemotes from 'hooks/useRemotes';
import useDevice from 'hooks/useDevice';
import { PRIVACY_POLICY_ROUTE, TERMS_OF_USE_ROUTE } from 'configuration/routes';
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
  const { hasOptionalCookies, cookieSettingsLabel, showPreferences } = useCookieConsent();
  const singlePages = useMemo(() => plugins.filter(isSinglePageModule), [plugins]);
  const newTabs = useMemo(() => plugins.filter(isNewTabModule), [plugins]);

  // Plugin menu items, as nav entries so desktop and mobile render them identically. Every plugin
  // gets one, including those that need a signed-in user: a single-page plugin's route asks an
  // anonymous visitor to sign in, and a new-tab plugin's page is not the host's to gate.
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

    const children: NavMenuEntry[] = [];

    if (!isLoadingThemeConfig && themeConfig.termsAndConditionsHtml) {
      children.push({ name: 'nav_menu.terms', route: TERMS_OF_USE_ROUTE, type: 'internal', Icon: AwardIcon });
    }

    if (!isLoadingThemeConfig && themeConfig.privacyPolicyHtml) {
      children.push({ name: 'nav_menu.privacy_policy', route: PRIVACY_POLICY_ROUTE, type: 'internal', Icon: LockIcon });
    }

    // Reopens the cookie preferences, the only way to withdraw a consent without clearing the cookie
    if (hasOptionalCookies) {
      // The label comes with the cookie banner's texts, which come in more languages than the rest of the app
      children.push({
        name: 'cookie_settings',
        type: 'action',
        label: cookieSettingsLabel,
        onClick: showPreferences,
        Icon: SettingsIcon,
      });
    }

    if (children.length) {
      output.push({
        name: 'nav_menu.legal',
        type: 'internal',
        Icon: ScalesIcon,
        children,
      });
    }

    return output;
  }, [
    pluginEntries,
    isLoadingThemeConfig,
    themeConfig.termsAndConditionsHtml,
    themeConfig.privacyPolicyHtml,
    hasOptionalCookies,
    cookieSettingsLabel,
    showPreferences,
  ]);

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
