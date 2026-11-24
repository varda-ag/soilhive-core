/**
 * The client is built with assetPrefix 'auto', so index.html refers to its own
 * files relatively ("static/js/…", "favicon.ico"). Anchor every relative src
 * and href at the base path, or a deep link would resolve them under its own
 * folder (ADR 0084). Absolute paths, URLs with a scheme, protocol-relative URLs,
 * fragments and empty values stay as they are.
 */
export function anchorRelativeUrls(html: string, basePath: string): string {
  return html.replace(/(\s(?:src|href)=")(?![a-z][a-z0-9+.-]*:|\/|#|")/gi, `$1${basePath}/`);
}
