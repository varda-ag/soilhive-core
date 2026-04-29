import DOMPurify from 'dompurify';
import parse from 'html-react-parser';

export function htmlDisplay(html: string) {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea'] });
  return <div className="content">{parse(clean)}</div>;
}
