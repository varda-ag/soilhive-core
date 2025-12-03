import { Button } from "components/UI";
import { useAuthContext } from "../../auth/AuthContextProvider";
import useTheme from "../../hooks/useTheme";
import { singlePages } from "../../utilities/moduleFederation";
import UserIcon from 'assets/icons/small-user-icon.svg?react';
import HamburgerIcon from 'assets/icons/medium-hamburger-menu-icon.svg?react'; 

import styles from './Header.module.scss'
import { NavLink } from 'react-router';

export default function Header() {

  const { logo } = useTheme()
  const { isAuthenticated, isLoading, login, logout } = useAuthContext();

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? `${styles.active}` : ''
  }

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        {logo && <img src={logo} alt="Logo" style={{ height: '47px' }} />}
      </div>
      <nav className={styles.nav}>
        <NavLink
          to="/"
          className={getNavLinkClass}
        >
          <span className={styles.linkText}>Availability</span>
        </NavLink>

        <NavLink
          to="/legal"
          className={getNavLinkClass}
        >
          <span className={styles.linkText}>Legal</span>
        </NavLink>

        {singlePages.map(({ route, name }) =>
          <NavLink
            key={route}
            to={`/${route}`}
            className={getNavLinkClass}
          >
            <span className={styles.linkText}>{name}</span>
          </NavLink>
        )}

        <NavLink
          to="/admin"
          className={getNavLinkClass}
        >
          <span className={styles.linkText}>Admin</span>
        </NavLink>


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


      <button className={styles.hamburger} aria-label="Menu">
        <HamburgerIcon /> 
      </button>

    </header>
  );
}