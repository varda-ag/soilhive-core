# Plugin Development

This is the how-to for building a module-federation plugin against this host — the CLI that scaffolds it, what it keeps in sync, and how to use the host's UI components and data inside your plugin. For how the host itself loads and routes plugins, see [Module Federation (Plugin System)](./module-federation.md).

## Prerequisites

- A `soilhive-core` checkout. The CLI is a repo-internal script, not a published package — it's run from within the checkout via `pnpm soilhive-plugin`, not installed or run standalone.
- `pnpm`. Plugins depend on `frontend-plugin-types` via a `link:../frontend-plugin-types` dependency — the pnpm-only `link:` protocol. **`npm install` will fail** with `Unsupported URL Type "link:"`; always use `pnpm install`.

## Creating a plugin

From the `soilhive-core` checkout:

```
pnpm soilhive-plugin <full-path-to-new-plugin> [--with-map]
```

`<full-path-to-new-plugin>` can point anywhere on disk, inside or outside the repo — e.g. `~/Documents/repo/plugins/my-plugin`. The command:

1. Scaffolds a working plugin project at that path (rsbuild + module-federation config, a placeholder `App`/`bootstrap`/`ProviderComponent`, a mock context for local preview).
2. Syncs in the host's `UI/` component library and design tokens.
3. Syncs `frontend-plugin-types` into `<parent-of-plugin>/frontend-plugin-types` — a sibling folder shared by every plugin under that same parent, not copied per-plugin.
4. If `--with-map` is passed (or the plugin already opted in on a previous run — see [Using the map](#using-the-map---with-map)), also syncs in the host's interactive map component and its dependencies.
5. Merges the dependencies the CLI manages into `package.json` without touching any you've added yourself.

It ends with the next steps to run:

```
cd <full-path-to-new-plugin>
pnpm install
pnpm dev
```

## Syncing an existing plugin

There's no separate sync command — re-running the exact same `pnpm soilhive-plugin <full-path>` against an existing plugin folder *is* the sync. The CLI detects an existing plugin by checking its `package.json` for `react`/`react-dom`/`frontend-plugin-types` dependencies ([`resolveMode`](../../frontend-scripts/soilhive-plugin/paths.ts)); anything else at that path is treated as an error, not silently overwritten.

Run it again any time you want to pick up host changes — new `UI/` components, updated design tokens, a new `UI/` dependency.

## What gets synced, and what happens to it on re-run

Not everything is treated the same way. Each category has a deliberate overwrite policy:

| Category | Policy | What's in it |
|---|---|---|
| **Always overwritten** — host is authoritative | Every sync fully replaces the destination. Any hand-edit is discarded on the next run. | The entire `UI/` folder ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)); `frontend-plugin-types` ([`syncPluginTypes.ts`](../../frontend-scripts/soilhive-plugin/syncPluginTypes.ts)); the design-token partials `styles/variables/_colors.scss` and `_typography.scss`; with `--with-map`, also `Map/` — including its cross-cutting files, nested under `Map/_shared/` — ([`syncMap.ts`](../../frontend-scripts/soilhive-plugin/syncMap.ts) — see [Using the map](#using-the-map---with-map)) |
| **Copied once, then dev-owned** | Only written if missing. Yours to edit afterward; the CLI never touches it again. | All scaffold files — `rsbuild.config.ts`, `module-federation.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml`, `src/App.tsx`, `src/bootstrap.tsx`, `src/components/ProviderComponent.tsx`, `src/mockContext.ts`, etc. ([`scaffold.ts`](../../frontend-scripts/soilhive-plugin/scaffold.ts)); `styles/base.scss`, `styles/fonts.scss`, `styles/variables/_breakpoints.scss`, and the plugin's `styles/index.scss`. This includes the `resolve.alias`/`paths` entries for `assets`/`hooks`/`types`/`utilities`/`configuration` in `rsbuild.config.ts`/`tsconfig.json` — added unconditionally, whether or not the plugin ever uses `--with-map`, specifically so opting into the map later never needs to touch this dev-owned config |
| **Generated, then dev-owned** | Written once from a filtered copy of the host's file, not a byte-for-byte copy. | `styles/index.scss` — mirrors the host's `frontend/src/styles/index.scss` but drops the `prime.react.override` import and the `primereact`/`react-loading-skeleton` package CSS, since nothing in `UI/` depends on either ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)) |
| **Merged, not overwritten** | `package.json`'s CLI-managed keys are updated in place; anything you've added stays. | `dependencies.react`, `dependencies['react-dom']`, `dependencies['frontend-plugin-types']`, plus every non-relative package a live scan of `UI/`'s actual imports turns up (and, with `--with-map`, of the vendored `Map/` + cross-cutting files too) — each pinned to the exact version in the host's `frontend/package.json` ([`packageJson.ts`](../../frontend-scripts/soilhive-plugin/packageJson.ts)) |
| **Never copied** | Refused even if a `neverCopy` path is passed to the copy engine. | `prime.react.override.scss`, unconditionally. `SoilhiveMap.scss` is blocked *unless* `--with-map` is active, in which case it's vendored alongside the map — see [Using the map](#using-the-map---with-map) |

Practical consequence: **don't hand-edit anything inside `UI/`** (or, with `--with-map`, `Map/`). Both are meant to be used as-is; the next sync silently discards changes there. Everything else the CLI writes is yours from the moment it's created — the CLI never re-touches it after the first write.

## Using a host UI component

Import directly from the component's own file — not from the `UI/` barrel (`UI/index.ts`):

```tsx
import { Button } from '../../UI/Button/Button';
```

Not:

```tsx
// Don't do this
import { Button } from '../../UI';
```

The barrel re-exports every component in `UI/`, so importing through it pulls in the whole re-exported module graph — including other components' dependencies you don't need (e.g. an unrelated component's `react-tooltip` import, or `.svg?react` icon imports). A direct import only pulls in what that one component actually needs.

`frontend-plugin-example/src/components/ProviderComponent.tsx` has a commented-out example of both the import and the usage, ready to uncomment once `UI/` has been synced into your plugin.

## Using the map (`--with-map`)

Passing `--with-map` (see [Creating a plugin](#creating-a-plugin)) syncs in `SoilhiveMap` — the same interactive map the host uses on its Availability page — plus everything it needs: `DrawControl`, `useDevice`, the map utilities, and the `maplibre-gl`/`react-map-gl`/`@turf/turf`/`h3-js`/etc. dependencies, merged into your `package.json` the same way `UI/`'s are. It's opt-in rather than always-synced because that dependency tree is meaningfully heavier than anything else vendored so far — not every plugin needs a map.

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

`SoilhiveMap` is a fully controlled component — it owns no context of its own, only the props you pass it (`selectionState` is required; everything else, including the optional `dai` prop group, is opt-in). See `frontend/src/components/Map/SoilhiveMap.tsx` for the full prop reference once synced.

Everything `Map/` reaches outside its own folder for — `DrawControl`, `useDevice`, the map utilities, `types/backend`, `configuration/layout`, and the icons it references — lands nested under `Map/_shared/`, not flat at your plugin root. This is deliberate: it keeps everything map-related visually contained in one place, distinct from your own top-level `hooks/`/`utilities/`/`types/`/`configuration`/`assets` (those aliases still exist unconditionally for your own code — see the scaffold table above — they're just not what `Map/`'s own files use). Treat `Map/_shared/` the same as `Map/` itself: host-authoritative, never hand-edited.

### Map/'s translations

`Map/`'s own strings (the toolbar, the selection bar, the DAI widget) are translated via `useTranslation('availability')`, same as the host. Rather than vendoring a copy of the locale data, `i18next`/`react-i18next` are shared as module-federation singletons ([`frontend/src/utilities/moduleFederation.ts`](../../frontend/src/utilities/moduleFederation.ts), `module-federation.config.ts`'s `shared` — added unconditionally for every plugin, whether or not it uses `--with-map`, same reasoning as the aliases above): once your plugin is embedded in the host, `Map/`'s translations resolve against the host's own already-initialized instance for free — full namespace, live language switching, nothing to maintain on your side.

That only takes effect once the host loads your plugin. Running it standalone (`pnpm dev`) has no host to share with, so nothing initializes `react-i18next`'s default instance — `Map/`'s strings render as raw keys (e.g. `dai_widget.title`) until something does. For standalone preview, initialize your own in `bootstrap.tsx` (a commented pointer is already there), the same way the host does in `frontend/src/utilities/i18n.ts`:

```tsx
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { availability: { /* whatever subset of frontend/public/locales/en/availability.json you need for preview */ } } },
});
```

**Three things the host's map has that yours won't, by design** (see [ADR 0025](../adr/0025-map-is-vendored-behind-an-opt-in-flag.md) for the full rationale — each transitively needed `primereact`, which plugins deliberately don't depend on, or in DAI's case a host-only network hook):

| Host feature | Not vendored because | What you get instead |
|---|---|---|
| DAI overlay | Needs a host-only network hook tied to a live backend filter session | Nothing equivalent — omit the `dai` prop entirely |
| Selection info card (`AreaInfo`) | Also the planned future home of a `map-info-card` capability that must stay host-only (ADR 9997) | `PluginContext.mapSelection` — build your own card, rendered via `SoilhiveMap`'s `children` (needs `react-map-gl` context, e.g. a `Popup`) or `footer` (a plain flex-sibling, e.g. a bottom bar) slot |
| Style switcher UI | Needs `primereact` via `Dialog` | `currentMapStyleIndex` prop — build your own switcher and feed the index back in |
| "Upload a polygon" toolbar modal | Needs `primereact` via `Dialog` | `SoilhiveMapRef.onUpload` is the destination for an *already-parsed* geometry — it doesn't read files or wire up a drop zone itself. Pass your own `onUploadClick` to show your own upload UI, or wire up drag-and-drop yourself — see below |

### Uploading a polygon (drag-and-drop or your own UI)

`SoilhiveMapRef.onUpload(geometry: Polygon | MultiPolygon)` only accepts an already-parsed geometry — reading the dropped file and parsing it into GeoJSON is your page's job, the same way it's `Availability.tsx`'s job in the host. `Map/_shared/utilities/parseGeoJSONFile` is vendored specifically for this (same validation/error handling as the host); wire it up to a `ref` and your own drop-zone handlers:

```tsx
import { useRef } from 'react';
import SoilhiveMap, { type SoilhiveMapRef } from '../Map/SoilhiveMap';
import { parseGeoJSONFile } from '../Map/_shared/utilities/parseGeoJSONFile';

function MyMapPage() {
  const mapRef = useRef<SoilhiveMapRef>(null);

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const result = await parseGeoJSONFile(file);
    if (result.error) {
      // result.error.id / result.error.message — surface however you like
      return;
    }
    mapRef.current?.onUpload(result.polygon);
  };

  return (
    <div onDragOver={event => event.preventDefault()} onDrop={onDrop}>
      <SoilhiveMap ref={mapRef} /* ...selectionState, onSelectionChange, etc. */ />
    </div>
  );
}
```

`onUploadClick` (a `SoilhiveMap` prop, shows an "Upload a polygon" toolbar item) follows the same shape without the drag events — call `parseGeoJSONFile` on whatever file your own upload UI collects, then `mapRef.current?.onUpload(result.polygon)`.

## Using host data and hooks (`PluginContext`)

Your exposed page component receives a `context: PluginContext` prop (typed via `frontend-plugin-types`, synced in as described above) giving access to host data and hooks — theme colors, soil data queries, coverage/filter queries, map selection, the logged-in user. See `frontend-plugin-example/src/components/ProviderComponent.tsx` for a full example using every field, and [Module Federation § Building a remote module](./module-federation.md#building-a-remote-module) for the exact export shape the host expects (`name`, `route`, `type`, `Page` as named exports).

## Registering your plugin with the host

Scaffolding and syncing a plugin doesn't make it appear in the host — that's a separate step, and currently has no UI: an entry has to be added directly to the host's `ThemeConfig.plugins` (e.g. via `PUT /config/theme` or the DB), pointing `url` at your remote's `mf-manifest.json`. See [Module Federation § Configuring remotes](./module-federation.md#configuring-remotes) for the full field list (`enabled`, `mustBeLoggedIn`, `enableACL`, `acl`).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm error Unsupported URL Type "link:"` | Ran `npm install` instead of `pnpm install` | Use `pnpm install` — `frontend-plugin-types` is linked via the pnpm-only `link:` protocol |
| `[ERR_PNPM_IGNORED_BUILDS]` | A dependency's install script needs approval | Already scaffolded into `pnpm-workspace.yaml`'s `allowBuilds`; if a new dependency trips this, add it there |
| `Module not found: Can't resolve './App.css'` (or similar) | A scaffold file is missing | Re-run `pnpm soilhive-plugin <full-path>` — scaffold files are copy-once, so this only backfills what's actually missing |
| A CSS custom property (e.g. `--color-cta-default-solid`) resolves to nothing at runtime | `styles/index.scss` isn't imported anywhere | Check `src/bootstrap.tsx` imports `../styles/index.scss` |
| `Module not found: Can't resolve 'hooks/useDevice'` (or `assets/...`, `types/...`, `utilities/...`) **in your own code** | Plugin was scaffolded before these aliases existed — `rsbuild.config.ts`/`tsconfig.json` are copy-once, so re-syncing won't add missing entries to a file that already exists. (`Map/`'s own files don't hit this — their references to these are rewritten to relative `Map/_shared/` paths at sync time, not resolved via these aliases.) | Manually add the `assets`/`hooks`/`types`/`utilities`/`configuration` entries to `resolve.alias` in `rsbuild.config.ts` and to `paths` in `tsconfig.json`, matching `frontend-plugin-example`'s versions |
| `Module not found: Can't resolve 'primereact/confirmdialog'` (or similar) inside `Map/` | Hand-edited something under `Map/` to pull in a component that needs `primereact` | Don't — `Map/` is host-authoritative like `UI/`, and `primereact` is deliberately excluded (see [ADR 0025](../adr/0025-map-is-vendored-behind-an-opt-in-flag.md)) |
