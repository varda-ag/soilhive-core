import sanitizeHtml from 'sanitize-html';
import parse from 'html-react-parser';

const FORBIDDEN_TAGS = ['form', 'input', 'button', 'select', 'textarea'];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.filter((tag: string) => !FORBIDDEN_TAGS.includes(tag)),
  disallowedTagsMode: 'discard',
};

export function htmlDisplay(html: string | undefined | null) {
  if (!html || html.length === 0) return '';
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS);
  return <>{parse(clean)}</>;
}
