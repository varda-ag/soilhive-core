import { Button } from "components/UI";
import { useAuthContext } from "../../auth/AuthContextProvider";
import useTheme from "../../hooks/useTheme";
import { singlePages } from "../../utilities/moduleFederation";
import UserIcon from 'assets/icons/small-user-icon.svg?react';
import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react';
import CloseIcon from 'assets/icons/medium-cross-menu-icon.svg?react';

import styles from './Header.module.scss'
import { NavLink } from 'react-router';
import { useState } from 'react';
import MobileMenu from "components/MobileMenu/MobileMenu";

export default function Header() {

  const menuEntries = [
    {
      name: 'Availability',
      route: '/'
    },
    {
      name: 'Legal',
      route: '/legal'
    },
    {
      name: 'Admin',
      route: '/admin'
    }
  ]

  const { logo } = useTheme()
  const { isAuthenticated, isLoading, login, logout } = useAuthContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? `${styles.active}` : ''
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className={styles.header}>
        <div className={styles.logo}>
          {logo && <img src={logo} alt="Logo" style={{ height: '47px' }} />}
        </div>
        <nav className={`${styles.nav} ${isMenuOpen ? styles.mobileOpen : ''}`}>

        {menuEntries.map(({ name, route }) =>
            <NavLink
            to={`${route}`}
            className={getNavLinkClass}
          >
            <span className={styles.linkText}>{name}</span>
          </NavLink>
          )}

          {singlePages.map(({ route, name }) =>
            <NavLink
              key={route}
              to={`/${route}`}
              className={getNavLinkClass}
            >
              <span className={styles.linkText}>{name}</span>
            </NavLink>
          )}

          {isLoading ? (
            <span>Loading...</span>
          ) : isAuthenticated ? (
            <>
              <Button type={'tertiary'} onClick={logout}>
                <UserIcon />
                Log out
              </Button>
            </>
          ) : (
            <Button type={'tertiary'} onClick={() => login()}>
              <UserIcon />
              Log in
            </Button>
          )}
        </nav>


        <button
          className={styles.hamburger}
          aria-label="Menu"
          onClick={toggleMenu}
        >
          {isMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>

      </header>
      {isMenuOpen && (
        <MobileMenu menuEntries={menuEntries} setIsMenuOpen={setIsMenuOpen} />
      )}
    </>
  );
}