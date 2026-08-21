# Plugin Development

This document explains how to build a module-federation plugin for this host. It covers the CLI that scaffolds and syncs a plugin, and how to use the host's UI components, map, and data inside a plugin.

For how the host loads and routes plugins, see [Module Federation (Plugin System)](./module-federation.md).

## Prerequisites

- You need a `soilhive-core` checkout. The CLI is a repo-internal script. It is not a published package. Run it from inside the checkout, with `pnpm soilhive-plugin`.
- You need `pnpm`. A plugin depends on `frontend-plugin-types` through a `link:../frontend-plugin-types` dependency. This uses the pnpm-only `link:` protocol. `npm install` fails with `Unsupported URL Type "link:"`. Always use `pnpm install` inside a plugin folder.

## Creating a plugin

Run this command from the `soilhive-core` checkout:

```
pnpm soilhive-plugin <full-path-to-new-plugin> [--with-map]
```

`<full-path-to-new-plugin>` can point anywhere on disk. It can be inside or outside this repo, for example `~/Documents/repo/plugins/my-plugin`.

The command does five things:

1. It scaffolds a working plugin project at that path: rsbuild and module-federation config, a placeholder `App`/`bootstrap`/`ProviderComponent`, and a mock context for local preview.
2. It syncs the host's `UI/` component library and design tokens into the plugin folder.
3. It syncs `frontend-plugin-types` into `<parent-of-plugin>/frontend-plugin-types`. This is a sibling folder. Every plugin under the same parent folder shares it. The CLI does not copy it per plugin.
4. If you pass `--with-map` (or the plugin already opted in on an earlier run — see [Using the map](#using-the-map---with-map)), it also syncs the host's interactive map component and its dependencies.
5. It merges the dependencies the CLI manages into `package.json`. It does not touch any dependency you added yourself.

When the command finishes, it prints the next steps:

```
cd <full-path-to-new-plugin>
pnpm install
pnpm dev
```

## Syncing an existing plugin

There is no separate sync command. To sync a plugin, run the same `pnpm soilhive-plugin <full-path>` command again against its folder.

The CLI detects an existing plugin by checking its `package.json` for `react`, `react-dom`, and `frontend-plugin-types` dependencies ([`resolveMode`](../../frontend-scripts/soilhive-plugin/paths.ts)). If a folder exists at that path but does not look like a plugin, the CLI stops and reports an error. It never overwrites an unrelated folder.

Run the sync command any time you want to pick up host changes: new `UI/` components, updated design tokens, or a new `UI/` dependency.

## What gets synced, and what happens to it on re-sync

The CLI does not treat every file the same way. Each file falls into one of five categories.

| Category | Rule on each run | What is in it |
|---|---|---|
| **Always overwritten** — host is authoritative | The CLI replaces the destination file completely on every run. Any hand-edit is lost on the next run. | The whole `UI/` folder ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)); `frontend-plugin-types` ([`syncPluginTypes.ts`](../../frontend-scripts/soilhive-plugin/syncPluginTypes.ts)); the design-token files `styles/variables/_colors.scss` and `_typography.scss`; and, with `--with-map`, the whole `Map/` folder plus its supporting files under `Map/_shared/` (see [Using the map](#using-the-map---with-map)) |
| **Copied once, then yours** | The CLI writes the file only if it is missing. After that, it is yours to edit. The CLI never writes to it again. | Every scaffold file: `rsbuild.config.ts`, `module-federation.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml`, `src/App.tsx`, `src/App.css`, `src/bootstrap.tsx`, `src/index.tsx`, `src/env.d.ts`, `src/components/ProviderComponent.tsx`, `src/components/ProviderComponent.css`, `src/mockContext.ts` ([`scaffold.ts`](../../frontend-scripts/soilhive-plugin/scaffold.ts)); also `styles/base.scss`, `styles/fonts.scss`, `styles/variables/_breakpoints.scss`, and the plugin's own `styles/index.scss` |
| **Generated once, then yours** | The CLI writes this file once, from a filtered copy of the host's file. It is not a byte-for-byte copy. | `styles/index.scss`. It mirrors the host's `frontend/src/styles/index.scss`, but drops the `prime.react.override` import and the `primereact`/`react-loading-skeleton` package CSS. `UI/` does not depend on either package ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)) |
| **Merged, never overwritten wholesale** | The CLI updates only the keys it manages in `package.json`. Every key you added yourself stays untouched. | See [Managed `package.json` dependencies](#managed-packagejson-dependencies) below ([`packageJson.ts`](../../frontend-scripts/soilhive-plugin/packageJson.ts)) |
| **Never copied** | The copy engine refuses to write this file, even if a caller passes its path by mistake. | `prime.react.override.scss`, always. `SoilhiveMap.scss` is blocked unless `--with-map` is active; see [Using the map](#using-the-map---with-map) |

This has one practical consequence: **do not hand-edit anything inside `UI/`, or, with `--with-map`, inside `Map/`.** Both folders are host-authoritative. The next sync discards any change you make there.

Every other file the CLI writes is yours from the moment it is created. The CLI never touches it again after the first write.

### Managed `package.json` dependencies

Every sync updates these keys in `dependencies` and `devDependencies`. It does not touch any other key.

| Key | Value |
|---|---|
| `dependencies.react`, `dependencies['react-dom']` | Pinned to the exact version in the host's `frontend/package.json` |
| `dependencies['frontend-plugin-types']` | `link:../frontend-plugin-types` |
| `devDependencies.typescript` | Pinned to the host's exact TypeScript version, for every plugin, even one without `--with-map`. Vendored host code is only ever type-checked against the host's own compiler version. Without this pin, the scaffold's own `typescript` version — copied once, then yours — can drift behind the host's and reject valid vendored code |
| `devDependencies['@types/react']`, `devDependencies['@types/react-dom']` | Pinned alongside `react`/`react-dom`, when the host declares them |
| One `dependencies` entry per external package that `UI/` imports (and, with `--with-map`, that the vendored `Map/` folder imports too) | Each pinned to the exact version in the host's `frontend/package.json`. The CLI finds these packages by scanning the actual import statements in the vendored files, not from a fixed list, so this list grows as `UI/` or `Map/` grows |
| A matching `devDependencies['@types/<package>']` for each scanned package above | Added automatically whenever the host declares a matching `@types/<package>` version |
| `dependencies.i18next`, whenever `dependencies['react-i18next']` is pinned | `react-i18next` needs a matching `i18next` version to work. Nothing in `UI/` or `Map/` imports `i18next` directly, so the CLI pins it as a companion package. Module federation must resolve both packages to the exact same version, or it cannot share `i18next` as a singleton between the host and the plugin |

The CLI looks up each version in the host's `frontend/package.json` first. If a package is not declared there, it falls back to the monorepo root `package.json`. This fallback exists because some packages — for example `@types/geojson` — are declared only at the workspace root and reach `frontend/` through pnpm's workspace resolution. A standalone plugin folder is not part of that workspace, so it needs the version spelled out explicitly.

## Using a host UI component

Import a component directly from its own file. Do not import it from the `UI/` barrel file (`UI/index.ts`).

Do this:

```tsx
import { Button } from '../../UI/Button/Button';
```

Do not do this:

```tsx
// Don't do this
import { Button } from '../../UI';
```

The barrel file re-exports every component in `UI/`. Importing through it pulls in the whole re-exported module graph, including dependencies you do not need — for example, another component's `react-tooltip` import, or an unrelated `.svg?react` icon import. A direct import pulls in only what that one component needs.

`frontend-plugin-example/src/components/ProviderComponent.tsx` has a commented-out example of both the import and its usage. Uncomment it once `UI/` is synced into your plugin.

## Using the map (`--with-map`)

Pass `--with-map` (see [Creating a plugin](#creating-a-plugin)) to sync in `SoilhiveMap`. This is the same interactive map the host uses on its Availability page.

Syncing `--with-map` vendors:

- The `Map/` folder itself.
- Its supporting files, nested under `Map/_shared/`: `DrawControl.tsx`, `hooks/useDevice.ts`, `hooks/useDragAndDropUpload.ts`, `configuration/layout.ts`, five `utilities/` files (`geo.ts`, `geometry.ts`, `map.ts`, `simplifyGeometry.ts`, `environmentVariables.ts`, `parseGeoJSONFile.ts`), `types/backend.ts`, and the icons `Map/` uses.
- `styles/SoilhiveMap.scss`. Unlike the files above, this file stays flat under the plugin's own `styles/` folder, next to the rest of `styles/`.
- The `maplibre-gl`, `react-map-gl`, `@turf/turf`, `h3-js`, and related npm packages, merged into your `package.json` the same way `UI/`'s dependencies are (see [Managed `package.json` dependencies](#managed-packagejson-dependencies)).

`--with-map` is opt-in, not always-on, because this dependency tree is much heavier than anything else vendored so far. Not every plugin needs a map.

```tsx
import SoilhiveMap from '../Map/SoilhiveMap';

function MyMapPage() {
  const [selectionState, setSelectionState] = useState(/* selectedPoint, selectedH3Cell, h3Cells, selection, showDrawControl, showSelectionToolbar — see SoilhiveMapSelectionState */);

  return (
    <SoilhiveMap
      showGeocoder
      showH3Cells
      selectionState={selectionState}
      onSelectionChange={event => {
        /* update your own state from event.geometries/bounds/selectionType/locationName */
      }}
    />
  );
}
```

`SoilhiveMap` is a fully controlled component. It owns no state of its own. It only uses the props you pass it. `selectionState` is required. Every other prop, including the `dai` prop group, is optional. See `frontend/src/components/Map/SoilhiveMap.tsx` for the full prop reference once it is synced.

### Where `Map/`'s supporting files live

Every file `Map/` needs from outside its own folder — `DrawControl`, `useDevice`, the map utilities, `types/backend`, `configuration/layout`, and its icons — lands nested under `Map/_shared/`. It does not sit flat at the plugin root.

This keeps every map-related file in one place, separate from your own code. The sync step rewrites `Map/`'s own import paths to point at `Map/_shared/` automatically. You never need to add an import alias for this yourself.

The plugin scaffold does not define `hooks`, `types`, `utilities`, `assets`, or `configuration` import aliases for your own code. `rsbuild.config.ts` defines only one alias, `styles`, used by both `UI/` and `Map/`'s SCSS files. If you want your own aliases, add them yourself to your own `rsbuild.config.ts` and `tsconfig.json` — both files are yours to edit after the first scaffold.

Treat `Map/_shared/` the same way you treat `Map/` itself: host-authoritative, never hand-edited.

### `Map/`'s translations

`Map/`'s own text — the toolbar, the selection bar, the DAI widget — is translated with `useTranslation('availability')`, the same way the host translates it. The CLI does not vendor a copy of the translation data.

Instead, `i18next` and `react-i18next` are shared as module-federation singletons. The plugin scaffold declares this sharing unconditionally, in every plugin's `module-federation.config.ts`, whether or not the plugin uses `--with-map` (see [`frontend/src/utilities/moduleFederation.ts`](../../frontend/src/utilities/moduleFederation.ts) for the host side). `module-federation.config.ts` is copied once, then yours to edit, so declaring the sharing upfront means adding `--with-map` later never requires you to edit this file.

Once the host loads your plugin, `Map/`'s translations resolve against the host's own, already-initialized `i18next` instance. You get the full translation namespace and live language switching, with nothing to maintain on your side.

This sharing only works once the host loads your plugin. Running your plugin standalone with `pnpm dev` has no host to share with, so nothing initializes `react-i18next`'s default instance. In that case, `Map/`'s text renders as raw keys, for example `dai_widget.title`.

To fix this for standalone preview, initialize your own `i18next` instance in `bootstrap.tsx`. A commented pointer to this is already there. Initialize it the same way the host does, in `frontend/src/utilities/i18n.ts`:

```tsx
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { availability: { /* whatever subset of frontend/public/locales/en/availability.json you need for preview */ } } },
});
```

### Three host features you do not get

The host's map has three features that `--with-map` does not vendor. Each one needs `primereact`, which plugins deliberately do not depend on, or, for the DAI overlay, a host-only network hook. See [ADR 0027](../adr/0027-map-is-vendored-behind-an-opt-in-flag.md) for the full reasoning.

| Host feature | Why it is not vendored | What you get instead |
|---|---|---|
| DAI overlay | It needs a host-only network hook, tied to a live backend filter session | Nothing equivalent. Omit the `dai` prop |
| Selection info card (`AreaInfo`) | It is also the planned future home of a `map-info-card` capability that must stay host-only (see ADR 9997) | `PluginContext.mapSelection`. Build your own card and render it through `SoilhiveMap`'s `children` slot (needs `react-map-gl` context, for example a `Popup`) or `footer` slot (a plain sibling element, for example a bottom bar) |
| Style switcher UI | It needs `primereact`'s `Dialog` | The `currentMapStyleIndex` prop. Build your own switcher and pass the index back in |
| "Upload a polygon" toolbar modal | It needs `primereact`'s `Dialog` | `SoilhiveMapRef.onUpload`. It only accepts an already-parsed geometry; it does not read files or provide a drop zone. Pass your own `onUploadClick` to show your own upload UI, or wire up drag-and-drop yourself — see the next section |

### Uploading a polygon

`SoilhiveMapRef.onUpload(geometry: Polygon | MultiPolygon)` only accepts an already-parsed geometry. Reading the dropped file, and parsing it into GeoJSON, is your own page's job — the same way it is `Availability.tsx`'s job in the host.

`Map/_shared/hooks/useDragAndDropUpload` is vendored for exactly this. It is the same hook the host itself uses, not a separate copy. It handles the drag-enter and drag-leave counting for nested elements, and it calls `parseGeoJSONFile` then `onUpload` for you.

Spread its returned handlers onto whichever element should act as the drop zone. This can be your whole page, like the host, or just the map container. Use `isDragOver` to show your own drop overlay:

```tsx
import { useRef } from 'react';
import SoilhiveMap, { type SoilhiveMapRef } from '../Map/SoilhiveMap';
import { useDragAndDropUpload } from '../Map/_shared/hooks/useDragAndDropUpload';

function MyMapPage() {
  const mapRef = useRef<SoilhiveMapRef>(null);
  const { isDragOver, onDragEnter, onDragOver, onDragLeave, onDrop } = useDragAndDropUpload({
    onUpload: geometry => mapRef.current?.onUpload(geometry),
    onError: error => console.error(error.message), // surface however you like
  });

  return (
    <div onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragOver && <div className="my-drop-overlay">Drop a GeoJSON polygon to upload</div>}
      <SoilhiveMap ref={mapRef} /* ...selectionState, onSelectionChange, etc. */ />
    </div>
  );
}
```

For an "upload via a button" flow instead of drag-and-drop, use the `onUploadClick` prop on `SoilhiveMap`. It shows an "Upload a polygon" toolbar item. Call `Map/_shared/utilities/parseGeoJSONFile` directly on the file your own upload UI collects, then call `mapRef.current?.onUpload(result.polygon)`.

## Using host data and hooks (`PluginContext`)

Your exposed page component receives a `context: PluginContext` prop, typed through `frontend-plugin-types` (synced in as described above). It gives you access to host data and hooks: theme colors, soil data queries, coverage and filter queries, map selection, the logged-in user, and your plugin's own persisted config.

See `frontend-plugin-example/src/components/ProviderComponent.tsx` for a full example that uses every field. See [Module Federation § Building a remote module](./module-federation.md#building-a-remote-module) for the exact export shape the host expects: named exports `pluginId`, `name`, `route`, `type`, and `Page`.

### Persisting your plugin's own config

Call `context.usePluginConfig(pluginId, id, defaultConfig)` with the same `pluginId` you export from your page module. It reads and writes a config object scoped to `plugin:pluginId:id`, so it can never collide with another plugin's or the host's own config:

```tsx
import type { PluginContext } from 'frontend-plugin-types';

const pluginId = 'my-plugin';

type MySettings = { showAdvancedOptions: boolean };
const defaultSettings: MySettings = { showAdvancedOptions: false };

const Page: React.FC<{ context: PluginContext }> = ({ context }) => {
  const { config, isLoading, saveConfig } = context.usePluginConfig<MySettings>(pluginId, 'settings', defaultSettings);

  if (isLoading || !config) return null;

  return (
    <button onClick={() => saveConfig({ ...config, showAdvancedOptions: !config.showAdvancedOptions })}>
      Advanced options: {config.showAdvancedOptions ? 'on' : 'off'}
    </button>
  );
};

export { pluginId, name, route, type, Page };
```

## Registering your plugin with the host

Scaffolding and syncing a plugin does not make it appear in the host. That is a separate step, and it currently has no UI. You must add an entry directly to the host's `ThemeConfig.plugins` — for example through `PUT /config/theme`, or directly in the database — with `url` pointing at your remote's `mf-manifest.json`.

See [Module Federation § Configuring remotes](./module-federation.md#configuring-remotes) for the full field list: `enabled`, `mustBeLoggedIn`, `enableACL`, `acl`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm error Unsupported URL Type "link:"` | You ran `npm install` instead of `pnpm install` | Run `pnpm install`. `frontend-plugin-types` uses the pnpm-only `link:` protocol |
| `[ERR_PNPM_IGNORED_BUILDS]` | A dependency's install script needs approval | Check `pnpm-workspace.yaml`'s `allowBuilds` list; the scaffold already includes the packages that need this. If a new dependency triggers it, add that package to the list |
| `Module not found: Can't resolve './App.css'` (or a similar scaffold file) | A scaffold file is missing | Run `pnpm soilhive-plugin <full-path>` again. Scaffold files are copied once, so this only restores files that are actually missing |
| A CSS custom property (for example `--color-cta-default-solid`) resolves to nothing at runtime | `styles/index.scss` is not imported anywhere | Check that `src/bootstrap.tsx` imports `../styles/index.scss` |
| `Module not found: Can't resolve 'hooks/useDevice'` (or `assets/...`, `types/...`, `utilities/...`) in your own code | Your own code used a bare alias that does not exist. The scaffold defines only a `styles` alias | Use a relative import instead. If you want the alias, add it yourself to `resolve.alias` in `rsbuild.config.ts` and to `paths` in `tsconfig.json` — both files are yours to edit |
| A type error mentions a DOM event overload (for example `PointerEvent`) inside a file under `UI/` or `Map/` | Your plugin's `typescript` version is older than the host's | Run `pnpm soilhive-plugin <full-path>` again, then `pnpm install`. Every sync pins your `typescript` devDependency to the host's exact version |
| `Module not found: Can't resolve 'primereact/confirmdialog'` (or similar) inside `Map/` | You hand-edited a file under `Map/` to add a component that needs `primereact` | Do not edit files under `Map/`. It is host-authoritative, like `UI/`, and `primereact` is deliberately excluded (see [ADR 0027](../adr/0027-map-is-vendored-behind-an-opt-in-flag.md)) |
