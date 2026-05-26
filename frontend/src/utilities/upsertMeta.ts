/**
 * Inserts or updates a `<meta>` tag in `document.head`.
 *
 * If a meta element matching `selector` already exists its `content` attribute
 * is updated in-place; otherwise a new element is created and appended.
 *
 * @param selector   - CSS selector used to find an existing meta element (e.g. `'meta[name="description"]'`)
 * @param attrName   - Attribute that identifies the tag type: `'name'` for standard meta tags or `'property'` for Open Graph tags
 * @param attrValue  - Value to assign to `attrName` when creating a new element (e.g. `'og:title'`)
 * @param content    - Value to set on the `content` attribute
 */
export function upsertMeta(selector: string, attrName: 'name' | 'property', attrValue: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  if (el.getAttribute('content') !== content) el.setAttribute('content', content);
}
