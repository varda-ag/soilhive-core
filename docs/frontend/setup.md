# Development Setup

## Prerequisites

- **Node.js 22** — use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions
- **pnpm** — the workspace uses pnpm workspaces; do not use npm or yarn

## Install dependencies

From the repo root:

```sh
pnpm install -r
```

This installs dependencies for both `frontend/` and any other workspace packages.

## Environment variables

The frontend reads runtime configuration from `frontend/public/env-config.js`. This file is loaded as a `<script>` tag before any JS bundle and exposes values on `window._env_`.

Create the file before starting the dev server:

```js
// frontend/public/env-config.js
window._env_ = {
  BACKEND_BASE_URL: 'http://localhost:4001',
  MAPBOX_ACCESS_TOKEN: '<your Mapbox token, or empty string to disable the map>',
  GTM_CONTAINER_ID: '',    // optional — Google Tag Manager container ID
  COOKIE_DOMAIN: '',       // optional — overrides cookie domain for consent banner
};
```

`BACKEND_BASE_URL` must point to a running backend. `MAPBOX_ACCESS_TOKEN` is required to render the map; the app will load without it but map tiles won't appear.

In production the Express server generates `env-config.js` at startup from OS environment variables, so the file in `public/` is only used during local development.

## Running the dev server

```sh
# from the repo root
pnpm run dev

# or from frontend/ directly
pnpm dev
```

This runs Rsbuild in watch mode for both the `web` (browser) and `ssr` (Node.js) environments simultaneously, then starts the Express server on **http://localhost:3000**.

The backend is expected at `http://localhost:4001` by default. See `docs/backend.md` for how to run it.

## Build for production

```sh
# full SSR + client build
pnpm build

# client-only build (static SPA, no SSR)
pnpm build:client
```

Output:

| Path | Contents |
|---|---|
| `dist/client/` | Hashed JS/CSS bundles + `index.html` |
| `dist/server/index.cjs` | Express server bundle (CommonJS) |

## Start the production server

```sh
pnpm start
```

Runs `dist/server/index.cjs` with Node.js. The server serves static assets from `dist/client/` and handles SSR for eligible routes.

Environment variables can be set as OS env vars before starting:

```sh
BACKEND_BASE_URL=https://api.example.com \
MAPBOX_ACCESS_TOKEN=pk.xxx \
PORT=8080 \
node dist/server/index.cjs
```

If any of these variables are set, the server writes a fresh `env-config.js` into `dist/client/` at startup so SPA routes also pick them up.

## Available scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start Rsbuild + Express in watch mode |
| `pnpm build` | Full SSR + client production build |
| `pnpm build:client` | Client-only build |
| `pnpm start` | Run the compiled production server |
| `pnpm preview` | Build + start (useful for pre-deploy checks) |
| `pnpm test` | Run Jest once |
| `pnpm test:watch` | Run Jest in watch mode |
| `pnpm test:coverage` | Run Jest with coverage report |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript compiler check (no emit) |

## Path aliases

Rsbuild is configured with these TypeScript path aliases (defined in `rsbuild.config.ts` and `tsconfig.json`):

| Alias | Maps to |
|---|---|
| `assets/` | `src/assets/` |
| `components/` | `src/components/` |
| `hooks/` | `src/hooks/` |
| `types/` | `src/types/` |
| `styles/` | `src/styles/` |
| `adapters/` | `src/adapters/` |

Use these in imports rather than long relative paths:

```ts
// Good
import { Button } from 'components/UI/Button';

// Avoid
import { Button } from '../../../components/UI/Button';
```

## Docker

A `Dockerfile` is provided for containerized deployments. It runs `pnpm build` and then `node dist/server/index.cjs`. All four runtime env vars (`BACKEND_BASE_URL`, `MAPBOX_ACCESS_TOKEN`, `GTM_CONTAINER_ID`, `COOKIE_DOMAIN`) can be passed with `--env` or Docker Compose's `environment:` block.

## Health checks

The Express server exposes two health endpoints:

- `GET /health` — returns `{"status":"ok"}`, used by load balancers
- `GET /ready` — returns `{"status":"ok"}`, used by Docker `HEALTHCHECK`
