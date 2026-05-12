import { useCallback, useMemo, useRef, useState } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useClickAway } from 'react-use';

import ArrowDownIcon from 'assets/icons/dropdown-arrow-down-icon.svg?react';
import type { NavMenuEntry } from 'types/components';
import MenuLink from '../MenuLink/MenuLink';

import styles from './DropdownMenuItem.module.scss';

interface Props {
  menuEntry: NavMenuEntry;
}

export default function DropdownMenuItem({ menuEntry }: Props) {
  const { t } = useTranslation('common');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuItemRef = useRef(null);

  useClickAway(menuItemRef, () => isMenuOpen && setIsMenuOpen(false), ['click']);

  const submenuEntries = useMemo(() => {
    return menuEntry.children || [];
  }, [menuEntry]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prevValue => !prevValue);
  }, []);

  return (
    <div ref={menuItemRef} className={classnames(styles.DropdownMenuItem, { [styles.Opened]: isMenuOpen })}>
      <span className={styles.LinkText} onClick={toggleMenu} role="button">
        {t(menuEntry.name)} <ArrowDownIcon />
      </span>

      <div className={styles.Menu}>
        {submenuEntries.map(({ name, route, type, Icon }) => (
          <MenuLink
            key={route}
            to={`${route}`}
            text={t(name)}
            type={type}
            className={styles.MenuLink}
            activeClassName={styles.Active}
            Icon={Icon}
            onClick={() => setIsMenuOpen(false)}
          />
        ))}
      </div>
    </div>
  );
}
