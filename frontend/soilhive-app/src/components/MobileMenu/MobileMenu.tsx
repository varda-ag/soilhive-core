import { type Dispatch, type SetStateAction } from 'react';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import styles from './MobileMenu.module.scss';

type MenuEntry = {
  name: string;
  route: string;
};

type MobileMenuProps = {
  menuEntries: MenuEntry[];
  setIsMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export default function MobileMenu({ menuEntries, setIsMenuOpen }: MobileMenuProps) {
  const { t } = useTranslation('availability');

  return (
    <div className={styles.mobileMenu}>
      {menuEntries.map(({ name, route }) => (
        <NavLink key={route} to={route} className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>
          <span className={styles.linkText}>{t(name, name)}</span>
        </NavLink>
      ))}
    </div>
  );
}
