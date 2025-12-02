import { Button } from "components/UI";
import { useAuthContext } from "../../auth/AuthContextProvider";
import useTheme from "../../hooks/useTheme";
import { singlePages } from "../../utilities/moduleFederation";
import UserIcon from 'assets/icons/small-user-icon.svg?react';

import styles from './Header.module.scss'
import { NavLink } from 'react-router';

export default function Header() {

  const { logo } = useTheme()
  const { isAuthenticated, isLoading, login, logout } = useAuthContext();

  const getNavLinkClass = ( { isActive }: {isActive: boolean}) => {
    return isActive ? `${styles.active}` : ''
  }

  /*if (!theme) { // Can this really happen?
    return null;
  }*/

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        {logo && <img src={logo} alt="Logo" />}
      </div>
      <nav className={styles.nav}>
          <NavLink 
            to="/"
            className={getNavLinkClass}
          >
              Availability
          </NavLink>

          {singlePages.map(({ route, name }) =>
            <NavLink 
              key={route} 
              to={`/${route}`}
              className={getNavLinkClass}
            >
              {name}
            </NavLink>
          )}

          <NavLink 
            to="/admin"
            className={getNavLinkClass}
          >
            Admin
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
    </header>
  );
}