import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor } from 'primereact/editor';
import Skeleton from 'react-loading-skeleton';

import { Button } from '../../../components/UI';
import useTheme from '../../../hooks/useTheme';
import { EDITOR_HEADER } from '../../../configuration/editor';

import styles from './PrivacyPolicy.module.scss';

export function PrivacyPolicy() {
  const { t } = useTranslation('admin');
  const { isLoadingThemeConfig, themeConfig, savePrivacyPolicy } = useTheme();
  const [html, setHtml] = useState(themeConfig.privacyPolicyHtml);

  const onSave = useCallback(() => {
    savePrivacyPolicy(html);
  }, [savePrivacyPolicy, html]);

  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }

  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('privacy_policy.subtitle')}</h3>
        <Editor value={html} onTextChange={e => setHtml(e.htmlValue!)} style={{ height: '340px' }} headerTemplate={EDITOR_HEADER} />
        <Button onClick={onSave}>{t('privacy_policy.save')}</Button>
      </main>
    </div>
  );
}
