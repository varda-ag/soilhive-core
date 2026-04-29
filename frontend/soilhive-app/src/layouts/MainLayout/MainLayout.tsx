import { Outlet } from 'react-router';
import Header from 'components/Header/Header';
import styles from './MainLayout.module.scss';
import { NotificationBanner } from 'components/NotificationBanner/NotificationBanner';
import { useState } from 'react';
import useTheme from 'hooks/useTheme';

export function MainLayout() {
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  const [showNotificationBanner, setShowNotificationBanner] = useState(true);
  const onNotificationBannerClose = () => {
    setShowNotificationBanner(false);
  };

  return (
    <>
      <div className={styles.HeaderWrapper}>
        <Header></Header>
        {!isLoadingThemeConfig && themeConfig.notificationBannerHtml?.trim().length > 0 && showNotificationBanner && (
          <div className={styles.Banner}>
            <NotificationBanner htmlMessage={themeConfig.notificationBannerHtml} onClose={onNotificationBannerClose} />
          </div>
        )}
      </div>
      <div className={styles.Content}>
        <Outlet />
      </div>
    </>
  );
}
