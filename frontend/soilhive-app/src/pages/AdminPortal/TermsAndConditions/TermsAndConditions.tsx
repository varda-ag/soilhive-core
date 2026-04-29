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
  const editorHeader = (
    <>
      <span className="ql-formats">
        <select className="ql-header" defaultValue="">
          <option value="2">Heading</option>
          <option value="3">Subheading</option>
          <option value="">Normal</option>
        </select>
      </span>
      <span className="ql-formats">
        <button className="ql-bold" />
        <button className="ql-italic" />
        <button className="ql-underline" />
      </span>
      <span className="ql-formats">
        <button className="ql-list" value="ordered" type="button" />
        <button className="ql-list" value="bullet" type="button" />
      </span>
      <span className="ql-formats">
        <select className="ql-color" />
      </span>
      <span className="ql-formats">
        <button className="ql-link" />
      </span>
    </>
  );

  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <h3>{t('terms_and_conditions.subtitle')}</h3>
        <Editor value={html} onTextChange={e => setHtml(e.htmlValue!)} style={{ height: '340px' }} headerTemplate={editorHeader} />
        <Button onClick={onSave}>{t('terms_and_conditions.save')}</Button>
      </main>
    </div>
  );
}
