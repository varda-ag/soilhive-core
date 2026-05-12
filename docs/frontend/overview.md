# Frontend Architecture Overview

SoilHive's frontend is a React 19 single-page application with optional server-side rendering for specific routes. It is built with Rsbuild, served by an Express server, and supports a plugin architecture through Module Federation.

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Routing | React Router 7 |
| Build tool | Rsbuild 1.x (Rust-based, replaces webpack) |
| Server | Express 5 (SSR + static assets) |
| Server state | TanStack React Query 5 |
| Client state | React Context API |
| Language | TypeScript 5 |
| Styling | SCSS modules + CSS variables |
| UI library | PrimeReact 10 |
| Maps | MapLibre GL + H3-js + Turf.js |
| i18n | i18next + react-i18next |
| Plugin system | Module Federation 0.21 |
| Testing | Jest 30 + React Testing Library |

## Folder structure

```
frontend/
├── src/
│   ├── index.tsx              # Client entry (SPA boot or hydration)
│   ├── bootstrap.tsx          # Lazy wrapper for index.tsx
│   ├── App.tsx                # Root provider tree
│   ├── Routes.tsx             # React Router route definitions
│   ├── entry-server.tsx       # SSR render function (imported by Express)
│   │
│   ├── pages/                 # Top-level page components (one per route)
│   ├── modules/               # Feature modules that own sub-routes
│   ├── layouts/               # Shared page shells (header + sidebar wiring)
│   ├── components/            # Reusable React components
│   │   └── UI/                # Atomic design-system components
│   │
│   ├── contexts/              # React Context providers
│   ├── hooks/                 # Custom hooks (API, business logic, UI)
│   ├── api-client/            # HTTP client, error handling, request hook
│   ├── auth/                  # Auth providers, token storage, OIDC config
│   ├── guards/                # Route protection components
│   │
│   ├── configuration/         # Static app configuration (routes, endpoints, colors)
│   ├── adapters/              # Transform backend shapes → frontend types
│   ├── domain/                # Pure business-logic functions
│   ├── utilities/             # Generic helpers (URL building, geo, dates, i18n)
│   ├── types/                 # TypeScript interfaces (backend + frontend)
│   │
│   ├── styles/                # Global SCSS, variables, PrimeReact overrides
│   └── assets/                # Static images and icons
│
├── server/
│   └── index.ts               # Express server (entry for the SSR build)
│
├── public/
│   ├── env-config.js          # Runtime environment variables (see setup.md)
│   └── locales/               # i18n JSON translation files
│
├── tests/                     # Jest test files (mirrors src/ structure)
├── rsbuild.config.ts          # Dual-environment build config
└── package.json
```

## Provider tree

`App.tsx` wraps the application in a fixed order of React providers. The order matters — inner providers can consume outer ones.

```
QueryClientProvider          ← TanStack React Query cache
  NotificationProvider       ← Toast/banner notification queue
    CookieConsentProvider    ← Cookie consent banner state
      AuthContextProvider    ← Authentication (OIDC / password / none)
        ThemeProvider        ← Brand colors, terms, initial map bbox
          DownloadsProvider  ← Active and historical downloads
            AppRoutes        ← React Router + all page components
```

## Data flow

```
Backend API
    │
    ▼
httpClient (fetch wrapper, attaches Bearer token)
    │
    ├─ useApiQuery   ──► TanStack React Query cache ──► component via hook
    ├─ useApiMutation ─► direct call, invalidates cache
    └─ useRequest    ──► manual imperative call
                              │
                              ▼
                    React Context (AvailabilityContext, ThemeContext, …)
                              │
                              ▼
                    Page / Feature component
                              │
                              ▼
                    UI component (components/UI/)
```

## Key architectural decisions

**React Query for server state, Context for shared UI state.** API responses are cached and invalidated by React Query. Contexts hold derived or user-interaction state that multiple components need synchronously — filters, map geometry, notification queue.

**No Redux or Zustand.** The combination of React Query + Context covers all current needs without additional state libraries.

**Adapter layer.** Backend API types (`types/backend.ts`) are never used directly in UI components. `adapters/datasetAdapter.ts` converts them to frontend types (`types/availability.ts`). This isolates API shape changes to a single file.

**Module Federation for plugins.** Third-party or internal teams can extend the app with additional pages by publishing a remote module. The host app loads it at runtime; missing remotes fail silently.

**SSR only for SEO-critical routes.** Only `/datasets/:id` (the metadata page) is server-rendered. Everything else is a standard SPA. This keeps the SSR surface small and predictable.
