# Routing

The application uses **React Router 7** with `BrowserRouter`. Route definitions live in `src/Routes.tsx`.

## Route tree

```
BrowserRouter
└── MainLayout (header, sidebar shell)
    │
    ├── /datasets/:id              → Metadata page (SSR-enabled, see ssr.md)
    │
    ├── /terms-of-use              → TermsOfUse page (conditional on theme config)
    ├── /privacy-policy            → PrivacyPolicy page (conditional on theme config)
    ├── /donation                  → Donation page
    │
    ├── Module Federation pages    → Injected at runtime from remote modules
    │
    └── /* (catch-all)             → AvailabilityModule
        ├── /                      → Home / availability explorer
        ├── /explore               → Data explorer with filters + map
        └── /download              → Download summary

ADMIN_ROOT/* (default: /admin)     → AdminPortalGuard (requires auth + admin entitlement)
    ├── /datasets                  → Dataset list
    ├── /datasets/new              → New dataset wizard
    ├── /datasets/edit/:id
    │   ├── /general-info          → Step 1: general information
    │   ├── /soil-data             → Step 2: soil data configuration
    │   ├── /mappings              → Step 3: column mappings
    │   ├── /preview               → Step 4: data preview
    │   └── /settings              → Dataset settings
    ├── /look-and-feel             → Branding and color customization
    ├── /map-based-filters         → Map filter configuration
    ├── /map-settings              → Map display settings
    ├── /notification-banner       → Notification banner editor
    ├── /terms-and-conditions      → Terms editor
    └── /privacy-policy            → Privacy policy editor
```

## Modules

Large feature areas are split into **module files** that own their sub-route definitions:

- `src/modules/AvailabilityModule.tsx` — the main data explorer flow
- `src/modules/AdminPortalModule.tsx` — the admin portal

This keeps `Routes.tsx` short and lets each feature area manage its own sub-routes independently.

## Admin root path

The admin section root is configurable via `src/configuration/admin.ts`:

```ts
export const ADMIN_ROOT = '/admin';
```

All admin routes are relative to this constant so the prefix can be changed in one place.

## Route guards

`src/guards/AdminPortalGuard.tsx` wraps all admin routes. It checks:

1. The user is authenticated.
2. The user has the `admin` entitlement.

If either check fails, the user is redirected to the home page (`/`). Unauthenticated users are additionally shown the login modal.

## Module Federation pages

Remote modules can expose `type: 'single-page'` entries. These are loaded at startup in `src/utilities/moduleFederation.ts` and injected as additional `<Route>` elements inside `MainLayout`. See [module-federation.md](module-federation.md) for how to build a remote page.

## SSR-eligible routes

Only routes listed in `SSR_ROUTES` inside `src/entry-server.tsx` are server-rendered. All other routes are handled by the SPA client. See [ssr.md](ssr.md) for details.

## Adding a new page

1. Create a component in `src/pages/MyPage.tsx`.
2. Add a `<Route path="/my-path" element={<MyPage />} />` inside the appropriate section of `Routes.tsx`.
3. If the page needs to be inside `MainLayout`, place the route inside that layout's `<Route>` wrapper.
4. If the page requires admin access, place it inside `AdminPortalModule.tsx` and protect it with `AdminPortalGuard`.

## Page titles

Page titles are set declaratively with the `<PageTitle>` component, which updates `document.title`. For SSR pages, the title is injected as a `<title>` tag by the server; see [ssr.md](ssr.md).
