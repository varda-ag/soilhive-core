# ADR 0066: A plugin gains a second capability via a second Module Federation expose, not a capabilities object

**Status:** Accepted (SP-5538)

## Context

A `RemotePlugin` (the object a remote's bundle exports) is a discriminated union on `type`: `single-page`, `new-tab`, or `map-info-card`, mutually exclusive. This follows from the host loading one Module Federation exposed module per remote, at the default key `'.'` (`docs/frontend/module-federation.md`).

One plugin needs two entry points in the host at once: its routed page (`single-page`), and content inside the map's Area Information card. The dashboards plugin, for example, adds a "Generate soil analysis" button between the "area covered" value and the "Download GeoJSON" link. The button opens the plugin's own popup, then the plugin's own page with the selected area. Two ways to let one remote carry both capabilities were considered:

- **(A) Collapse the type union into a capabilities object.** One exposed module (`'.'`) exports `{ name, description?, singlePage?, mapInfoCard?, newTab? }`.
- **(B) Expose a second, independently loadable MF module from the same remote build**, `'./mapInfoCard'`, which exports the existing flat, type-tagged shape.

## Decision

**(B).** The `RemotePlugin` union is unchanged.

- The plugin declares its card by exposing `./mapInfoCard`; there is no operator flag. For every enabled remote whose page loaded, the host also calls `loadRemote(`${url}/mapInfoCard`)` and keeps the module only if it loads. The MF runtime resolves `${url}/mapInfoCard` against the remote registered under `name = url` by string prefix, so remote registration does not change. The remote entry is already loaded for the page, so a remote without the expose costs no network request.
- The card module exports `pluginId`, `name`, `type = 'map-info-card'` and `Page`. It uses the same `pluginId` as the page module. Cards are kept in their own list (`useRemotes().mapInfoCards`), outside the duplicate-`pluginId` check, so the pair is not reported as a duplicate.
- A card is kept only when a `single-page` plugin with the same `pluginId` survived loading and filtering (for example the `authMode NONE` filter). Each kept card is stored with that page's `route`.
- `MapInfoCardPlugin.Page` has the same props as a single-page `Page`: `{ context: PluginContext }`. The old `MapInfoCardProps` is removed.
- For a card, `PluginContext` adds two fields, both `undefined` on a routed page:
  - `mapSelectionFilterId?: string`: the id of a stored, geometry-only Filter of the map selection. The plugin reads it with `context.useFilter`, as for any Filter id.
  - `navigateToOwnPage?: (subPath?: string) => void`: opens a path relative to the plugin's own route, e.g. `'new?filterId=…'` → `/dashboards/new?filterId=…`. The host resolves it with `URL` against `/${route}/` and refuses (logs a warning, does not navigate) any result outside that route, such as `'../admin'`, `'/admin'` or `'//evil.com'`. Plugin code is otherwise trusted, but the host, not the plugin, decides where an in-map action can take the whole app.
- Every loaded card renders, in config order. Each card renders inside an error boundary that shows nothing on error, so a plugin bug cannot blank the map page.
- A card that fails to load is dropped silently: no card, no notification. The host cannot tell a remote with no `./mapInfoCard` from one whose card is broken. The plugin page stays available.
- A card module that loads with a type other than `map-info-card`, or without a required field, is reported as an invalid plugin, as for a page module.

## Remote-side contract

```ts
// module-federation.config.ts of the remote
exposes: {
  '.': './src/MyPage.tsx',             // single-page, as today
  './mapInfoCard': './src/MyCard.tsx', // map-info-card capability
},
```

```ts
// src/MyCard.tsx
const pluginId = 'my-plugin'; // the same id as the page module
const name = 'My Plugin';
const type = 'map-info-card';

const Page: React.FC<{ context: PluginContext }> = ({ context }) => (
  <button
    disabled={!context.mapSelectionFilterId}
    onClick={() => context.navigateToOwnPage?.(`new?filterId=${context.mapSelectionFilterId}`)}
  >
    Generate soil analysis
  </button>
);

export { pluginId, name, type, Page };
```

The card content, including any confirmation popup, belongs to the plugin and uses the vendored `UI/` library. The host provides only the slot, the selection Filter id and the navigation function.

## Considered options

- **Capabilities object (A).** Rejected: it breaks the documented discriminated-union contract for every plugin author, and both capabilities would ship in one JS chunk. The map card renders on every map visit and would pull in the whole page bundle to render one button.
- **A generic `navigate(path)` on `PluginContext`.** Rejected: a card could send the whole app to any path, such as `/admin`.
- **A zero-argument `navigateToOwnPage()`.** Rejected: it can open only the plugin's root route, not `/dashboards/new`.
- **The raw selection (`mapSelection`) in the context.** Rejected: sp-5524 replaced it with stored Filters read through `useFilter`; the card follows that.
- **A boolean flag on the operator's config row (`Plugin`).** The host would request `./mapInfoCard` only when the flag is set, and could report a failed card load. Rejected: having a map card is a capability of the plugin, not an install choice, so the operator should not have to configure it, nor keep it in step with the plugin's build.
- **Only one card at a time.** Dropped: the host renders every card in config order, so there is no rule to enforce.

## Consequences

- A remote offers both capabilities by exposing `./mapInfoCard`; the operator configures nothing.
- A broken card fails silently: a card whose module throws while loading, or whose chunk is unreachable, looks the same as no card. The plugin author sees it only by checking that the card appears.
- A card without a routed page of the same `pluginId` is never shown.
- The host saves a geometry-only Filter for each selection only while at least one card is loaded.
