# Frontend

React 19 SPA with optional SSR, built with Rsbuild and served by Express.

## Quick start

```sh
# 1. Create frontend/public/env-config.js
echo 'window._env_ = { BACKEND_BASE_URL: "http://localhost:4001", MAPBOX_ACCESS_TOKEN: "" };' \
  > frontend/public/env-config.js

# 2. Install dependencies
pnpm install -r

# 3. Start the dev server
pnpm run dev
```

App available at **http://localhost:3000**. See [frontend/setup.md](frontend/setup.md) for full setup instructions and environment variable reference.

## Documentation

| Document | Contents |
|---|---|
| [frontend/overview.md](frontend/overview.md) | Tech stack, folder structure, provider tree, data flow, key architectural decisions |
| [frontend/setup.md](frontend/setup.md) | Prerequisites, env vars, dev server, build, scripts, path aliases, Docker |
| [frontend/routing.md](frontend/routing.md) | Route tree, modules, admin root, guards, adding new pages |
| [frontend/state-management.md](frontend/state-management.md) | React Query, Context API, decision guide, patterns |
| [frontend/api-integration.md](frontend/api-integration.md) | httpClient, useApiQuery, useApiMutation, useRequest, error handling, adding endpoints |
| [frontend/authentication.md](frontend/authentication.md) | Auth modes (OIDC / password / none), token storage, entitlements, SSR auth |
| [frontend/ssr.md](frontend/ssr.md) | SSR architecture, request lifecycle, hydration, adding SSR routes, SEO head injection |
| [frontend/module-federation.md](frontend/module-federation.md) | Plugin system, building a remote module, shared dependencies |
| [frontend/hooks-reference.md](frontend/hooks-reference.md) | All custom hooks with descriptions |
| [frontend/styling-theming.md](frontend/styling-theming.md) | SCSS architecture, dynamic theming, PrimeReact, UI library, i18n |
| [frontend/testing.md](frontend/testing.md) | Jest setup, component testing, hook testing, mocking, patterns |
