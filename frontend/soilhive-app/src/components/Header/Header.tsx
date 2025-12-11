import useTheme from '../../hooks/useTheme';
import { singlePages } from '../../utilities/moduleFederation';
import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';

import styles from './Header.module.scss';
import { NavLink } from 'react-router';
import { useState } from 'react';
import MobileMenu from 'components/MobileMenu/MobileMenu';
import AuthButton from 'components/AuthButton/AuthButton';

export default function Header() {
  const menuEntries = [
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

  const { logo } = useTheme();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? `${styles.active}` : '';
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}>{logo && <img src={logo} alt="Logo" />}</div>
        <nav className={`${styles.nav} ${isMenuOpen ? styles.mobileOpen : ''}`}>
          {menuEntries.map(({ name, route }) => (
            <NavLink key={route} to={`${route}`} className={getNavLinkClass}>
              <span className={styles.linkText}>{name}</span>
            </NavLink>
          ))}

          {singlePages.map(({ route, name }) => (
            <NavLink key={route} to={`/${route}`} className={getNavLinkClass}>
              <span className={styles.linkText}>{name}</span>
            </NavLink>
          ))}

          <AuthButton></AuthButton>
        </nav>

        <button className={styles.hamburger} aria-label="Menu" onClick={toggleMenu}>
          {isMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>
      </header>
      {isMenuOpen && <MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen} />}
    </>
  );
}
