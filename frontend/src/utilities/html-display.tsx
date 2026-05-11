import DOMPurify from 'dompurify';
import parse from 'html-react-parser';

export function htmlDisplay(html: string | undefined | null) {
  if (!html || html.length === 0) return '';
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea'] });
  return <>{parse(clean)}</>;
}
