import { useCallback, useState } from 'react';
import styles from './NotificationBanner.module.scss';
import { useTranslation } from 'react-i18next';
import { Editor } from 'primereact/editor';
import { Button } from '../../../components/UI';
import Skeleton from 'react-loading-skeleton';
import useTheme from '../../../hooks/useTheme';

export function NotificationBanner() {
  const { t } = useTranslation('admin');
  const { isLoadingThemeConfig, themeConfig, saveNotificationBanner } = useTheme();
  const [html, setHtml] = useState(themeConfig.notificationBannerHtml);
  const onSave = useCallback(() => {
    saveNotificationBanner(html);
  }, [saveNotificationBanner, html]);

  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('notification_banner.subtitle')}</h3>
        <p>{t('notification_banner.description')}</p>
        <Editor value={html} onTextChange={e => setHtml(e.htmlValue!)} style={{ height: '340px' }} />
        <Button onClick={onSave}>{t('notification_banner.save')}</Button>
      </main>
    </div>
  );
}
