import { useCallback, useState } from 'react';
import styles from './TermsAndConditions.module.scss';
import { useTranslation } from 'react-i18next';
import { Editor } from 'primereact/editor';
import { Button } from '../../../components/UI';
import Skeleton from 'react-loading-skeleton';
import useTheme from '../../../hooks/useTheme';

export function TermsAndConditions() {
  const { t } = useTranslation('admin');
  const { isLoadingThemeConfig, themeConfig, saveTermsAndConditions } = useTheme();
  const [html, setHtml] = useState(themeConfig.termsAndConditionsHtml);
  const onSave = useCallback(() => {
    saveTermsAndConditions(html);
  }, [saveTermsAndConditions, html]);

  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('terms_and_conditions.subtitle')}</h3>
        <Editor value={html} onTextChange={e => setHtml(e.htmlValue!)} style={{ height: '340px' }} />
        <Button onClick={onSave}>{t('terms_and_conditions.save')}</Button>
      </main>
    </div>
  );
}
