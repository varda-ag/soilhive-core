# ADR 0066: A plugin gains a second capability via a second Module Federation expose, not a capabilities object

**Status:** Accepted (SP-5538)

## Context

A `RemotePlugin` (the object a remote's bundle exports) is a discriminated union on `type`: `single-page`, `new-tab`, or `map-info-card`, mutually exclusive. This follows from the host loading one Module Federation exposed module per remote, at the default key `'.'` (`docs/frontend/module-federation.md`).

One plugin needs two entry points in the host at once: its routed page (`single-page`), and content inside the map's Area Information card. The dashboards plugin, for example, adds a "Generate soil analysis" button between the "area covered" value and the "Download GeoJSON" link. The button opens the plugin's own popup, then the plugin's own page with the selected area. Two ways to let one remote carry both capabilities were considered:

- **(A) Collapse the type union into a capabilities object.** One exposed module (`'.'`) exports `{ name, description?, singlePage?, mapInfoCard?, newTab? }`.
- **(B) Expose a second, independently loadable MF module from the same remote build**, `'./mapInfoCard'`, which exports the existing flat, type-tagged shape.

## Decision

**(B).** The `RemotePlugin` union is unchanged.

- The plugin declares its card in its page module (`'.'`) by exporting `hasMapInfoCard = true`; there is no operator flag. Only then does the host call `loadRemote(`${url}/mapInfoCard`)`. The MF runtime resolves `${url}/mapInfoCard` against the remote registered under `name = url` by string prefix, so remote registration does not change.
- The `./mapInfoCard` expose holds the component: the module exports `pluginId`, `name`, `type = 'map-info-card'` and `Page`, with the same `pluginId` as the page module. The host attaches that `Page` to the loaded page plugin as `MapInfoCard`. There is no separate list of cards: the duplicate-`pluginId` check and the `authMode NONE` filter drop a card together with its plugin.
- A card renders only for a `single-page` plugin, whose `route` `navigateToOwnPage` needs.
- `MapInfoCardPlugin.Page` has the same props as a single-page `Page`: `{ context: PluginContext }`. The old `MapInfoCardProps` is removed.
- For a card, `PluginContext` adds two fields, both `undefined` on a routed page:
  - `mapSelectionFilterId?: string`: the id of a stored, geometry-only Filter of the map selection. The plugin reads it with `context.useFilter`, as for any Filter id.
  - `navigateToOwnPage?: (subPath?: string) => void`: opens a path relative to the plugin's own route, e.g. `'new?filterId=…'` → `/dashboards/new?filterId=…`. The host resolves it with `URL` against `/${route}/` and refuses (logs a warning, does not navigate) any result outside that route, such as `'../admin'`, `'/admin'` or `'//evil.com'`. Plugin code is otherwise trusted, but the host, not the plugin, decides where an in-map action can take the whole app.
- Every loaded card renders, in config order. Each card renders inside an error boundary that shows nothing on error, so a plugin bug cannot blank the map page.
- A declared card that fails to load, or that loads without `type = 'map-info-card'` or without a `Page`, is an error: the host shows a "Plugin map card unavailable" notification, and the plugin page stays available without a card. Both cases share the one notification, since the card module is not a plugin of its own to report as invalid.

## Remote-side contract

```ts
// module-federation.config.ts of the remote
exposes: {
  '.': './src/MyPage.tsx',             // single-page, as today
  './mapInfoCard': './src/MyCard.tsx', // map-info-card capability
},
```

```ts
// src/MyPage.tsx (the '.' module): also exports pluginId, name, type = 'single-page', route, Page
const hasMapInfoCard = true;
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
- **A boolean flag on the operator's config row (`Plugin`).** Rejected: having a map card is a capability of the plugin, not an install choice, so the operator should not have to configure it, nor keep it in step with the plugin's build.
- **Try `./mapInfoCard` on every plugin, with no declaration.** Rejected: the host cannot tell a plugin without a card from one whose card is broken, so a broken card fails silently.
- **Cards in their own list, paired with their page afterwards.** Rejected: the pairing had to repeat the dedup and auth filtering by `pluginId` and remote url. A card attached to its own plugin is kept or dropped with it.
- **Only one card at a time.** Dropped: the host renders every card in config order, so there is no rule to enforce.

## Consequences

- A remote offers both capabilities by exposing `./mapInfoCard` and exporting `hasMapInfoCard = true` from its page module; the operator configures nothing.
- A declared card that does not load is reported to the user; a plugin that does not declare one costs no card request.
- A card of a plugin without a routed page is never shown.
- The host saves a geometry-only Filter for each selection only while at least one card is loaded.
