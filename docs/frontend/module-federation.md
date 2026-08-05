# Module Federation (Plugin System)

The frontend uses [Module Federation](https://module-federation.io/) to support a plugin architecture. External packages — called **remote modules** — can add pages to the SoilHive app at runtime without modifying the host application.

## Concepts

| Term | Meaning |
|---|---|
| **Host** | The SoilHive frontend (`mf_host`) — loads and renders remotes |
| **Remote** | A separately built frontend package that exposes components |
| **Manifest** | A `mf-manifest.json` file exposed by each remote that describes its exports |
| **Plugin config** | An entry in the host's theme config (`ThemeConfig.plugins`) that registers a remote's manifest URL and access rules |
| **PluginContext** | The typed contract (`frontend-plugin-types`) passed as a `context` prop to a remote's page component, giving it access to host data and hooks |

The host discovers remotes through its theme configuration (see [Configuring remotes](#configuring-remotes)) and loads them via `src/utilities/moduleFederation.ts` and `src/contexts/RemotesContext.tsx`.

---

## How the host loads remotes

Loading is split across two files:

1. `src/utilities/moduleFederation.ts` creates the MF runtime instance (`mf`) once, at module load, with no remotes registered yet — it's a singleton and must never be recreated. It exposes `loadRemotes(configs)`, which registers and loads a given list of remotes on demand, returning the resolved modules (a remote that fails to load resolves to `null` and is filtered out).
2. `src/contexts/RemotesContext.tsx` (`RemotesProvider`) calls `loadRemotes(themeConfig.plugins)` once the theme config has finished loading, guarded so it only runs once, and exposes the result through `useRemotes()` as `{ plugins, isLoadingRemotes }`.

This used to run at module-evaluation time via top-level await against a hardcoded remote list. It now runs inside `RemotesProvider`'s effect because the remote list itself is no longer hardcoded — it comes from the theme config (see below).

`Routes.tsx` reads `useRemotes().plugins`, filters them with `isSinglePageModule` (exported from `moduleFederation.ts`), and maps the survivors to `<Route>` elements inside `MainLayout` — passing each `Page` a `context` prop (see [PluginContext](#plugincontext)).

---

## Configuring remotes

Remotes are **not** hardcoded in the frontend source. Each one is an entry in the host's theme configuration — `ThemeConfig.plugins`, typed as `Plugin[]` in `src/types/plugins.ts` — fetched from the backend via `GET /config/theme`. There is currently no admin-portal UI for editing this list (unlike colors, map settings, terms/privacy content, which do have dedicated admin screens) — it has to be set directly, e.g. via `PUT /config/theme` or the DB:

| Field | Meaning |
|---|---|
| `url` | The remote's manifest URL (`mf-manifest.json`) — also used as the remote's registration name |
| `enabled` | Whether the host should load this remote at all |
| `mustBeLoggedIn` | Restricts the plugin to authenticated users |
| `enableACL` / `acl` | Restricts the plugin to users in the listed ACL groups |

The default theme config ships with `plugins: []` — no remotes registered — so a fresh environment shows no plugin pages until one is added. Nothing seeds a plugin entry automatically: running `frontend-plugin-example` locally (`module_example`, served at `http://localhost:3333/mf-manifest.json`) only makes the remote reachable — to actually see it in the host, a dev still has to add a matching entry to `ThemeConfig.plugins` directly (there's no UI for this yet) with `enabled: true`.

---

## Building a remote module

Running `pnpm soilhive-plugin <path>` scaffolds a plugin repo already wired up for steps 1–2 below (see `frontend-plugin-example/` for a working reference, and `docs/frontend/plugin-development.md` for the full authoring guide). This section documents what that scaffold produces and expects.

### 1. Configure Module Federation in the remote

Using `@module-federation/enhanced`:

```ts
// rsbuild.config.ts of the remote
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'my_plugin',
      filename: 'mf-manifest.json',
      exposes: {
        '.': './src/MyPage.tsx',
      },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    }),
  ],
});
```

Expose the page component at `'.'` (the remote's root) — the host loads it by remote name alone (`mf.loadRemote(remote.url)`, no exposed-module suffix), so there's nothing to resolve against without a root export.

### 2. Export plugin metadata from the exposed module

The host treats the loaded remote module as a `RemotePlugin` (see `src/types/plugins.ts`). For a routable page, export `type`, `name`, `route`, and a `Page` component as **named exports** — not a default export:

```ts
// src/MyPage.tsx in the remote — exposed at '.' in module-federation.config.ts
import type { PluginContext } from 'frontend-plugin-types';

const Page: React.FC<{ context: PluginContext }> = ({ context }) => {
  return <div>Hello from my plugin</div>;
};

const name = 'My Plugin';
const type = 'single-page';
const route = 'my-plugin-page'; // becomes the URL path /my-plugin-page in the host app

export { name, route, type, Page };
```

`Page` receives a `context: PluginContext` prop (from `frontend-plugin-types`) giving access to host data and hooks — theme, soil data queries, map selection, the logged-in user. See `frontend-plugin-example/src/components/ProviderComponent.tsx` for a full example, and `docs/frontend/plugin-development.md` for the complete contract.

### 3. Register the remote with the host

There's no file in this repo to edit, and (currently) no admin-portal UI either. Add an entry to the host's theme configuration (`ThemeConfig.plugins`) directly — e.g. via `PUT /config/theme` or the DB — pointing `url` at your remote's `mf-manifest.json` and setting `enabled: true` (plus `mustBeLoggedIn` / `enableACL` / `acl` if the plugin should be access-restricted). The host picks this up on next load — no rebuild or redeploy of the host is required.

### 4. Start the remote dev server

The remote must be served before the host loads it. Run the remote's dev server on its configured port (e.g. `localhost:3333`) before or alongside `pnpm dev` in the host.

---

## Shared dependencies

`react` and `react-dom` are declared as singletons in both host and remote. This means the host's copy is always used — the remote does not bundle its own React. This prevents the "two copies of React" error that causes context and hooks to break.

The host pins an explicit `requiredVersion` (currently `19.2.0`) when registering its shared singletons. A remote isn't required to pin the same version explicitly (`frontend-plugin-example` just sets `singleton: true`), but a real version mismatch will cause Module Federation to log a warning and may result in unexpected behaviour — keep the remote's `react`/`react-dom` version aligned with the host's.

---

## Silent failure in development

If a remote is registered but not running, the host continues to boot without it. The `fallbackPlugin` intercepts the load error and returns `<div />` instead of the remote component. No console errors are emitted. This makes it safe to develop the host without all remotes running locally.

To verify a remote loaded successfully, check `useRemotes().plugins` (via React DevTools, or by logging inside `RemotesProvider`), or inspect the MF runtime internals directly in the browser console:

```js
// In browser dev tools
window.__FEDERATION__  // MF runtime internals
```
