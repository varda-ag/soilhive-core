import { useAuthContext } from "../../auth/AuthContextProvider";
import useTheme from "../../hooks/useTheme";
import { singlePages } from "../../utilities/moduleFederation";
import { Button } from "../UI/Button/Button";
import styles from './Header.module.scss'

export default function Header() {

    const { logo, theme } = useTheme()
    const { isAuthenticated, isLoading, login, logout, user } = useAuthContext();

    if (!theme) { // Can this really happen?
        return null;
    }

    return (
        <header className={styles.header}>
            <div className={styles.header}>
                {logo && <img src={logo} alt="logo" style={{ width: '167px', height: '59px' }} />}
            </div>
            <nav className={styles.nav}>
                <Button to="/">Availability</Button>
                {singlePages.map(({ route, name }) => <Button key={route} to={`/${route}`}>{name}</Button>)}
                <Button to='/Admin'>Admin</Button>
                {isLoading ? (
                    <span>Loading...</span>
                ) : isAuthenticated ? (
                    <>
                        <span>{user?.profile?.name}</span>
                        <Button onClick={logout}>Log out</Button>
                    </>
                ) : (
                    <Button onClick={() => login()}>Log in</Button>
                )}
            </nav>
        </header>
    )
}