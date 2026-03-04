import useTheme from '../../hooks/useTheme';
import { singlePages } from '../../utilities/moduleFederation';
import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';

import styles from './Header.module.scss';
import { NavLink } from 'react-router';
import { useState } from 'react';
import MobileMenu from 'components/MobileMenu/MobileMenu';
import AuthButton from 'components/AuthButton/AuthButton';
import { DownloadsStatus } from 'components/DownloadsStatus/DownloadsStatus';
import useDevice from 'hooks/useDevice';

const MENU_ENTRIES = [
  {
    name: 'Availability',
    route: '/',
  },
  {
    name: 'Legal',
    route: '/legal',
  },
  {
    name: 'Admin',
    route: '/admin',
  },
];

export default function Header() {
  const { isDesktopLayout } = useDevice();

  const { logo } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
          {logo && <img src={logo} alt="Logo" />}
        </div>
        <div className={styles.Menu}>
          {isDesktopLayout && (
            <nav data-testid="sh-header-nav" className={styles.Nav}>
              {MENU_ENTRIES.map(({ name, route }) => (
                <NavLink key={route} to={`${route}`} className={getNavLinkClass}>
                  <span className={styles.LinkText}>{name}</span>
                </NavLink>
              ))}

              {singlePages.map(({ route, name }) => (
                <NavLink key={route} to={`/${route}`} className={getNavLinkClass}>
                  <span className={styles.LinkText}>{name}</span>
                </NavLink>
              ))}
            </nav>
          )}
          <div className={styles.Additional}>
            <DownloadsStatus />
            <AuthButton />
          </div>
        </div>

        {!isDesktopLayout && (
          <button data-testid="sh-header-hamburger" className={styles.Hamburger} aria-label="Menu" onClick={toggleMenu}>
            {isMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        )}
      </header>
      {!isDesktopLayout && isMenuOpen && <MobileMenu menuEntries={MENU_ENTRIES} setIsMenuOpen={setIsMenuOpen} />}
    </>
  );
}
