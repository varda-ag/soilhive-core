import { useCallback, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import classnames from 'classnames';
import SeparateIcon from 'assets/icons/small-separate-icon.svg?react';
import LogoutIcon from 'assets/icons/logout-icon.svg?react';
import AwardIcon from 'assets/icons/award-icon.svg?react';
import MegaphoneHollowIcon from 'assets/icons/megaphone-hollow-icon.svg?react';
import MapPinIcon from 'assets/icons/map-pin-icon.svg?react';
import ImageIcon from 'assets/icons/image-icon.svg?react';
import ServerIcon from 'assets/icons/server-icon.svg?react';
import FilterIcon from 'assets/icons/filter2-icon.svg?react';
import { ADMIN_PATHS } from '../../../configuration/admin';
import { useAuthContext } from '../../../auth/AuthContextProvider';
import { ADMIN_PORTAL_DATA_MENU, ADMIN_PORTAL_UI_MENU, useEntitlements } from 'hooks/useEntitlementsHook';

import styles from './AdminSidebar.module.scss';

const UI_SECTION = {
  title: 'user_interface',
  items: [
    { url: ADMIN_PATHS.TERMS_AND_CONDITIONS, title: 'terms_and_conditions', Icon: AwardIcon, disabled: false },
    { url: ADMIN_PATHS.NOTIFICATION_BANNER, title: 'notification_banner', Icon: MegaphoneHollowIcon, disabled: false },
    { url: ADMIN_PATHS.MAP, title: 'map_settings', Icon: MapPinIcon, disabled: false },
    { url: ADMIN_PATHS.LOOK_AND_FEEL, title: 'look_and_feel', Icon: ImageIcon, disabled: false },
  ],
};

export function AdminSidebar() {
  const { t } = useTranslation('admin');
  const { can } = useEntitlements();
  const { logout } = useAuthContext();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  const dataSection = useMemo(() => {
    return {
      title: 'data',
      items: [
        {
          url: ADMIN_PATHS.DATASETS,
          title: 'datasets',
          Icon: ServerIcon,
          disabled: false,
        },
        { url: ADMIN_PATHS.FILTERS, title: 'filters', Icon: FilterIcon, disabled: false },
      ],
    };
  }, []);

  const navConfig = useMemo(() => {
    const sections = [];
    if (can(ADMIN_PORTAL_UI_MENU)) sections.push(UI_SECTION);
    if (can(ADMIN_PORTAL_DATA_MENU)) sections.push(dataSection);
    return sections;
  }, [can, dataSection]);

  return (
    <aside
      data-testid="sh-admin-sidebar"
      className={classnames(styles.AdminSidebar, {
        [styles.Collapsed]: isCollapsed,
      })}
    >
      <div className={styles.Content}>
        <div className={styles.ContentTop}>
          <div className={styles.Collapser} onClick={() => setIsCollapsed(prev => !prev)}>
            <SeparateIcon />
          </div>
          {navConfig.map(({ title, items }) => (
            <div key={title} className={styles.LinksSection}>
              <h3 className={styles.LinksSectionTitle}>{t(`sidebar.sections.${title}`)}</h3>
              <nav data-testid={`sh-admin-sidebarlinks-${title}`} className={styles.Links}>
                {items.map(({ url, Icon, title, disabled }) => {
                  return (
                    <NavLink
                      data-testid="sh-admin-sidebarlink"
                      key={url}
                      to={url}
                      aria-disabled={disabled}
                      className={({ isActive }) =>
                        classnames(styles.Link, {
                          [styles.Active]: isActive,
                          [styles.NavLinkDisabled]: disabled,
                        })
                      }
                    >
                      <Icon className={styles.LinkIcon} />
                      {!isCollapsed && <span className={styles.LinkTitle}>{t(`sidebar.menu.${title}`)}</span>}
                    </NavLink>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
        <div className={styles.ContentBottom}>
          <div data-testid="sh-admin-sidebar-logout" className={styles.Logout} onClick={handleLogout}>
            <LogoutIcon />
            {!isCollapsed && <span className={styles.LogoutText}>{t('sidebar.logout')}</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}
