import { useCallback, useMemo, useState } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';

import ArrowDownIcon from 'assets/icons/arrow-down-wide-icon.svg?react';
import type { NavMenuEntry } from 'types/components';
import MenuLink from 'components/Header/MenuLink/MenuLink';

import styles from './MobileDropdownMenuItem.module.scss';

interface Props {
  menuEntry: NavMenuEntry;
  onLinkClick?: () => void;
}

export default function MobileDropdownMenuItem({ menuEntry, onLinkClick }: Props) {
  const { t } = useTranslation('common');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const submenuEntries = useMemo(() => {
    return menuEntry.children || [];
  }, [menuEntry]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prevValue => !prevValue);
  }, []);

  return (
    <div className={classnames(styles.MobileDropdownMenuItem, { [styles.Opened]: isMenuOpen })}>
      <div className={styles.Toggler} onClick={toggleMenu} role="button">
        <span className={styles.TogglerText}>
          {menuEntry.Icon && <menuEntry.Icon />} {t(menuEntry.name)}
        </span>
        <ArrowDownIcon className={styles.DropdownIcon} />
      </div>

      <div className={styles.Menu}>
        {submenuEntries.map(({ name, route, type }) => (
          <MenuLink key={route} to={`${route}`} type={type} text={t(name)} className={styles.MenuLink} onClick={onLinkClick} />
        ))}
      </div>
    </div>
  );
}
