import { useCallback, useState } from 'react';
import styles from './TermsAndConditions.module.scss';
import { useTranslation } from 'react-i18next';
import { Editor } from 'primereact/editor';
import { Button } from '../../../components/UI';
import useConfig from '../../../hooks/useConfig';
import type { TermsAndConditionsConfig } from '../../../types/config';
import Skeleton from 'react-loading-skeleton';

export function TermsAndConditions() {
  const { t } = useTranslation('admin');
  const {
    isLoading: isLoadingTermsAndConditions,
    config: termsAndConditionsConfig,
    saveConfig: saveTermsAndConditions,
  } = useConfig<TermsAndConditionsConfig>('terms_and_conditions', { html: '' });
  const [html, setHtml] = useState(termsAndConditionsConfig!.html);
  const onSave = useCallback(() => {
    saveTermsAndConditions({ html });
  }, [saveTermsAndConditions, html]);

  if (isLoadingTermsAndConditions) {
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
