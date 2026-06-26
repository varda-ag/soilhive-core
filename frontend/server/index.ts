import fs from 'node:fs';
import path from 'node:path';
import express, { type Request } from 'express';
import compression from 'compression';
import { render, matchSSRRoute } from '../src/entry-server';

// Rsbuild compiles this to dist/server/index.cjs so __dirname is always
// dist/server/ at runtime.  Client assets are always at dist/client/.
const CLIENT_DIST = path.resolve(__dirname, '../client');

const PORT = Number(process.env.PORT ?? 3000);

// Generate env-config.js at startup so non-SSR (SPA) routes can load
// window._env_ via <script src="/env-config.js">.
//
// Only write the file when at least one env var is explicitly provided
// (i.e. in Docker / CI where vars are injected at runtime).  In local dev,
// public/env-config.js is copied to dist/client/ by Rsbuild during the build
// and must not be overwritten with empty values.
const _envVars = {
  BACKEND_BASE_URL: process.env.BACKEND_BASE_URL ?? '',
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? '',
  GTM_CONTAINER_ID: process.env.GTM_CONTAINER_ID ?? '',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? '',
  FEATURE_FLAGS: process.env.FEATURE_FLAGS ?? '',
};
const _envConfigPath = path.join(CLIENT_DIST, 'env-config.js');
const _hasEnvVars = Object.values(_envVars).some(v => v !== '');
if (_hasEnvVars || !fs.existsSync(_envConfigPath)) {
  fs.mkdirSync(CLIENT_DIST, { recursive: true });
  fs.writeFileSync(_envConfigPath, `window._env_ = ${JSON.stringify(_envVars)};`, 'utf-8');
}

// ---------------------------------------------------------------------------
// Bootstrap Express
// ---------------------------------------------------------------------------

const app = express();
app.use(compression());

// Static assets with long-lived cache for hashed filenames.
// env-config.js is regenerated at startup so it must NOT be cached.
app.use(
  express.static(CLIENT_DIST, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('env-config.js')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }),
);

// ---------------------------------------------------------------------------
// SSR auth resolution — reads Bearer token from Authorization header only
// ---------------------------------------------------------------------------

function resolveAuthToken(req: Request): string | null {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) return null;

  // Decode JWT payload to check expiry (no signature verification needed —
  // the backend will reject a tampered token when we forward it as Bearer).
  try {
    const payloadB64 = bearer.split('.')[1];
    if (!payloadB64) return null;
    const { exp } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const BUFFER_MS = 30_000;
    if (exp && exp * 1000 <= Date.now() + BUFFER_MS) return null; // expired
  } catch {
    console.warn('Failed to decode auth token payload; proceeding without auth');
    return null;
  }

  return bearer;
}

// ---------------------------------------------------------------------------
// Health check — used by load balancers and Docker HEALTHCHECK
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/ready', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// SSR + SPA fallback handler
// ---------------------------------------------------------------------------

const indexHtml = fs.readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf-8');

// Use app.use() as the catch-all — compatible with Express 4 and Express 5
// (Express 5 removed support for the bare `*` wildcard in app.get).
app.use((req, res) => {
  const url = req.originalUrl;
  const pathname = new URL(url, 'http://localhost').pathname;

  // Only spend cycles on auth resolution for routes that actually SSR.
  let authToken: string | null = null;
  const matchedPattern = matchSSRRoute(pathname);
  if (matchedPattern) {
    authToken = resolveAuthToken(req);
  }

  render(url, { authToken })
    .then(result => {
      if (result !== null && 'redirect' in result) {
        res.redirect(302, result.redirect);
        return;
      }
      if (result !== null) {
        const { html: ssrContent, dehydratedState, head } = result;
        // SSR route: inject server-rendered HTML and mark the root element so
        // the client-side hydration path is chosen instead of a full SPA boot.
        const headReplaced = head ? indexHtml.replace('<!--ssr-head-->\n    <title>SoilHive</title>', head) : indexHtml;
        const html = headReplaced
          .replace('<div id="root"><!--ssr-outlet--></div>', `<div id="root" data-ssr-page="${matchedPattern}">${ssrContent}</div>`)
          // Replace the external env-config.js reference with an inline script
          // so the runtime env vars are available before any JS bundle executes.
          .replace(
            '<script src="/env-config.js"></script>',
            `<script>window._env_=${JSON.stringify({
              BACKEND_BASE_URL: process.env.BACKEND_BASE_URL ?? '',
              MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? '',
              GTM_CONTAINER_ID: process.env.GTM_CONTAINER_ID ?? '',
              COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? '',
              FEATURE_FLAGS: process.env.FEATURE_FLAGS ?? '',
            })};window.__REACT_QUERY_STATE__=${JSON.stringify(dehydratedState)};</script>`,
          );

        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
      } else {
        // Non-SSR route: serve the SPA shell and let client-side routing handle it.
        res.status(200).set({ 'Content-Type': 'text/html' }).send(indexHtml);
      }
    })
    .catch(err => {
      console.error('SSR render error:', err);
      // On render failure fall back to the SPA shell so the user sees the app.
      res.status(200).set({ 'Content-Type': 'text/html' }).send(indexHtml);
    });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
