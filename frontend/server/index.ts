import fs from 'node:fs';
import path from 'node:path';
import express, { type Request } from 'express';
import compression from 'compression';
import { render, matchSSRRoute } from '../src/entry-server';

// Rsbuild compiles this to dist/server/index.cjs so __dirname is always
// dist/server/ at runtime.  Client assets are always at dist/client/.
const CLIENT_DIST = path.resolve(__dirname, '../client');

const PORT = Number(process.env.PORT ?? 3000);

// Runtime env vars are injected at process start (Docker / CI) and never
// change during the process lifetime, so build the inline env script once and
// splice it into the served index.html for every response (see baseHtml
// below).  This replaces the external <script src="/env-config.js"> reference
// so runtime env vars are available before any JS bundle executes — with no
// extra network round-trip and no cache-busting concern.
const _envVars = {
  BACKEND_BASE_URL: process.env.BACKEND_BASE_URL ?? '',
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ?? '',
  GTM_CONTAINER_ID: process.env.GTM_CONTAINER_ID ?? '',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? '',
  FEATURE_FLAGS: process.env.FEATURE_FLAGS ?? '',
};
const ENV_SCRIPT = `<script>window._env_=${JSON.stringify(_envVars)};</script>`;

// ---------------------------------------------------------------------------
// Bootstrap Express
// ---------------------------------------------------------------------------

const app = express();
app.use(compression());

// Static assets with long-lived cache for hashed filenames.
// index: false so `/` falls through to the catch-all below and is served the
// env-inlined SPA shell (baseHtml) rather than the raw index.html on disk.
app.use(express.static(CLIENT_DIST, { index: false }));

// ---------------------------------------------------------------------------
// SSR auth resolution
//
// On a document navigation the browser cannot attach an Authorization header
// (the token lives in localStorage, which is never transmitted). The client
// mirrors the token into a `token` cookie (see src/auth/tokenStore.ts) so it
// rides along with the navigation. Read the cookie first, then fall back to
// the Authorization header for any programmatic callers.
// ---------------------------------------------------------------------------

function readTokenCookie(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === 'token') {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}

function resolveAuthToken(req: Request): string | null {
  const bearer = readTokenCookie(req) ?? req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
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

// Inline the runtime env config into the SPA shell so it is served with every
// response — no separate /env-config.js request. All response paths (SSR, SPA
// fallback, error fallback) build on this.
const baseHtml = indexHtml.replace('<script src="/env-config.js"></script>', ENV_SCRIPT);

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
        // baseHtml already has window._env_ inlined (see ENV_SCRIPT); append the
        // React Query state right after it so both are set before any bundle runs.
        const headReplaced = head ? baseHtml.replace('<!--ssr-head-->\n    <title>SoilHive</title>', head) : baseHtml;
        const html = headReplaced
          .replace('<div id="root"><!--ssr-outlet--></div>', `<div id="root" data-ssr-page="${matchedPattern}">${ssrContent}</div>`)
          .replace(ENV_SCRIPT, `${ENV_SCRIPT}<script>window.__REACT_QUERY_STATE__=${JSON.stringify(dehydratedState)};</script>`);

        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
      } else {
        // Non-SSR route: serve the SPA shell and let client-side routing handle it.
        res.status(200).set({ 'Content-Type': 'text/html' }).send(baseHtml);
      }
    })
    .catch(err => {
      console.error('SSR render error:', err);
      // On render failure fall back to the SPA shell so the user sees the app.
      res.status(200).set({ 'Content-Type': 'text/html' }).send(baseHtml);
    });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
