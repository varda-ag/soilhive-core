import { useCallback, useState } from 'react';
import classnames from 'classnames';
import styles from './NotificationBanner.module.scss';
import { useTranslation } from 'react-i18next';
import { Editor, type EditorTextChangeEvent } from 'primereact/editor';
import { Button } from '../../../components/UI';
import Skeleton from 'react-loading-skeleton';
import useTheme from '../../../hooks/useTheme';

const MAX_LENGTH = 500;

export function NotificationBanner() {
  const { t } = useTranslation('admin');
  const { isLoadingThemeConfig, themeConfig, saveNotificationBanner } = useTheme();
  const [html, setHtml] = useState(themeConfig.notificationBannerHtml ?? '');
  const [textLength, setTextLength] = useState(() => (themeConfig.notificationBannerHtml ?? '').replace(/<[^>]*>/g, '').length);

  const handleTextChange = useCallback((e: EditorTextChangeEvent) => {
    setHtml(e.htmlValue!);
    setTextLength(e.textValue.trimEnd().length);
  }, []);

  const onSave = useCallback(() => {
    saveNotificationBanner(html);
  }, [saveNotificationBanner, html]);

  const isOverLimit = textLength > MAX_LENGTH;

  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('notification_banner.subtitle')}</h3>
        <p>{t('notification_banner.description')}</p>
        <Editor value={html} onTextChange={handleTextChange} style={{ height: '340px' }} />
        <span className={classnames(styles.Counter, { [styles.CounterError]: isOverLimit })}>
          {MAX_LENGTH - textLength} {t('notification_banner.symbols_left')}
        </span>
        <Button onClick={onSave}>{t('notification_banner.save')}</Button>
      </main>
    </div>
  );
}
