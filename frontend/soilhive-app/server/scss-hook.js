/**
 * Node.js ESM loader hook — dev server only.
 *
 * Intercepts .scss / .css imports and returns a Proxy that echoes back the
 * property name as a string, matching the shape of a CSS Modules object.
 * This lets tsx run entry-server.tsx without Rsbuild's SCSS pipeline.
 */

const MOCK_SRC = 'export default new Proxy({}, { get: (_, k) => k })';
const MOCK_URL = `data:text/javascript,${encodeURIComponent(MOCK_SRC)}`;

export function resolve(specifier, context, nextResolve) {
  if (/\.(?:scss|sass|css|less)$/.test(specifier)) {
    return { url: MOCK_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
