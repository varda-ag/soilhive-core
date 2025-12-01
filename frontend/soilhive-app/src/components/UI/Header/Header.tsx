import useTheme from "../../../hooks/useTheme";
import styles from './Header.module.scss'

export default function Header(){
    
    const {logo} = useTheme()

    return (
        <header className={styles.header}>
            <div className={styles.header}>
                {logo && <img src={logo} alt="logo" style={{width: '167px', height: '59px'}} />}
            </div>
            <nav className={styles.nav}>

            </nav>
        </header>
    )
}