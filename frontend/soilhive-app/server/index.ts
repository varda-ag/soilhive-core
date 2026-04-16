import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { render } from '../src/entry-server';

// Rsbuild compiles this to dist/server/index.cjs so __dirname is always
// dist/server/ at runtime.  Client assets are always at dist/client/.
const CLIENT_DIST = path.resolve(__dirname, '../client');

const PORT = Number(process.env.PORT ?? 3000);

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
// Health check — used by load balancers and Docker HEALTHCHECK
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
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

  try {
    const ssrContent = render(url);

    if (ssrContent !== null) {
      // SSR route: inject server-rendered HTML and mark the root element so
      // the client-side hydration path is chosen instead of a full SPA boot.
      const pathname = new URL(url, 'http://localhost').pathname;
      const html = indexHtml
        .replace('<div id="root"><!--ssr-outlet--></div>', `<div id="root" data-ssr-page="${pathname}">${ssrContent}</div>`)
        // Replace the external env-config.js reference with an inline script
        // so the runtime env vars are available before any JS bundle executes.
        .replace(
          '<script src="/env-config.js"></script>',
          `<script>window._env_=${JSON.stringify({
            BACKEND_BASE_URL: process.env.BACKEND_BASE_URL ?? '',
            MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? '',
            GTM_CONTAINER_ID: process.env.GTM_CONTAINER_ID ?? '',
            COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? '',
          })};</script>`,
        );

      res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
    } else {
      // Non-SSR route: serve the SPA shell and let client-side routing handle it.
      res.status(200).set({ 'Content-Type': 'text/html' }).send(indexHtml);
    }
  } catch (err) {
    console.error('SSR render error:', err);
    // On render failure fall back to the SPA shell so the user sees the app.
    res.status(200).set({ 'Content-Type': 'text/html' }).send(indexHtml);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
