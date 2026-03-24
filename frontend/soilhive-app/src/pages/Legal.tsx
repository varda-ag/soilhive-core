import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import { useTranslation } from 'react-i18next';

function htmlDisplay(html: string) {
  const clean = DOMPurify.sanitize(html);
  return <div className="content">{parse(clean)}</div>;
}

export default function Legal({ html }: { html: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="legal-page">
      <h2>{t('legal_page.title')}</h2>
      {htmlDisplay(html)}
    </div>
  );
}
