import { Button } from "components/UI";
import { useAuthContext } from "../../auth/AuthContextProvider";
import useTheme from "../../hooks/useTheme";
import { singlePages } from "../../utilities/moduleFederation";
import UserIcon from 'assets/icons/small-user-icon.svg?react';

import styles from './Header.module.scss'
import { Link } from 'react-router';

export default function Header() {

  const { logo, theme } = useTheme()
  const { isAuthenticated, isLoading, login, logout } = useAuthContext();

  if (!theme) { // Can this really happen?
    return null;
  }

  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        {logo && <img src={logo} alt="Logo" />}
      </div>
      <nav className={styles.nav}>
          <Link to="/">Availability</Link>
          {singlePages.map(({ route, name }) =>
            <Link key={route} to={`/${route}`}>{name}</Link>
          )}
          <Link to="/admin">Admin</Link>
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