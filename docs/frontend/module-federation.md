# Module Federation (Plugin System)

The frontend uses [Module Federation](https://module-federation.io/) to support a plugin architecture. External packages — called **remote modules** — can add pages to the SoilHive app at runtime without modifying the host application.

## Concepts

| Term | Meaning |
|---|---|
| **Host** | The SoilHive frontend (`mf_host`) — loads and renders remotes |
| **Remote** | A separately built frontend package that exposes components |
| **Manifest** | A `mf-manifest.json` file exposed by each remote that describes its exports |

The host discovers remotes through `src/utilities/moduleFederation.ts`. At startup it fetches each remote's manifest, loads the exposed modules, and registers them as routes (if they are `type: 'single-page'`).

---

## How the host loads remotes

`src/utilities/moduleFederation.ts` runs at module evaluation time (top-level await) before the React tree mounts:

1. Calls `loadRemotesConfig()` to get the list of remote manifests. Currently this returns a hardcoded array; in future it will be fetched from a configuration service.
2. Creates an MF runtime instance named `mf_host` with shared singletons for `react` and `react-dom`.
3. Loads all remotes concurrently with `Promise.all`. If a remote is unreachable (e.g. not running in local dev), it is silently skipped — the `fallbackPlugin` prevents any console errors or app crashes.
4. Exports `modules` (all loaded remote modules) and `singlePages` (modules with `type: 'single-page'`).

`Routes.tsx` maps `singlePages` to `<Route>` elements inside `MainLayout`, so each remote page gets a URL and is navigable like any other page.

---

## Current remotes

The default config registers one example remote:

```
name:  module_example
entry: http://localhost:3333/mf-manifest.json
```

This remote is not required to be running. If it is unreachable, the host app boots normally and the route simply does not appear.

---

## Building a remote module

A remote is a standard Rsbuild (or webpack/Vite) project configured to expose a Module Federation manifest.

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
        './MyPage': './src/MyPage.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '19.2.0' },
        'react-dom': { singleton: true, requiredVersion: '19.2.0' },
      },
    }),
  ],
});
```

### 2. Mark the exposed module as a page

The host treats modules with `type: 'single-page'` as routable pages. Export this metadata from your page module:

```ts
// src/MyPage.tsx in the remote
import React from 'react';

export const type = 'single-page';
export const path = '/my-plugin-page';   // URL path in the host app

export default function MyPage() {
  return <div>Hello from my plugin</div>;
}
```

### 3. Register the remote in the host

Add an entry to the `loadRemotesConfig()` function in `src/utilities/moduleFederation.ts`:

```ts
async function loadRemotesConfig(): Promise<RemoteConfig[]> {
  return [
    { name: 'module_example', entry: 'http://localhost:3333/mf-manifest.json' },
    { name: 'my_plugin',      entry: 'https://my-plugin.example.com/mf-manifest.json' },
  ];
}
```

### 4. Start the remote dev server

The remote must be served before the host loads. Run the remote's dev server on its configured port (e.g. `localhost:3333`) before or alongside `pnpm dev` in the host.

---

## Shared dependencies

`react` and `react-dom` are declared as singletons in both host and remote. This means the host's copy is always used — the remote does not bundle its own React. This prevents the "two copies of React" error that causes context and hooks to break.

Always match the required version in the remote to the host's version (`19.2.0`). A version mismatch will cause Module Federation to log a warning and may result in unexpected behaviour.

---

## Silent failure in development

If a remote is listed in `loadRemotesConfig()` but is not running, the host continues to boot without it. The `fallbackPlugin` intercepts the load error and returns `<div />` instead of the remote component. No console errors are emitted. This makes it safe to develop the host without all remotes running locally.

To verify a remote loaded successfully, check `modules` exported from `moduleFederation.ts` in the browser console:

```js
// In browser dev tools (after importing the module or via webpack global)
window.__FEDERATION__  // MF runtime internals
```
