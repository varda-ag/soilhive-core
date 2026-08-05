# Plugin Development

This is the how-to for building a module-federation plugin against this host — the CLI that scaffolds it, what it keeps in sync, and how to use the host's UI components and data inside your plugin. For how the host itself loads and routes plugins, see [Module Federation (Plugin System)](./module-federation.md).

## Prerequisites

- A `soilhive-core` checkout. The CLI is a repo-internal script, not a published package — it's run from within the checkout via `pnpm soilhive-plugin`, not installed or run standalone.
- `pnpm`. Plugins depend on `frontend-plugin-types` via a `link:../frontend-plugin-types` dependency — the pnpm-only `link:` protocol. **`npm install` will fail** with `Unsupported URL Type "link:"`; always use `pnpm install`.

## Creating a plugin

From the `soilhive-core` checkout:

```
pnpm soilhive-plugin <full-path-to-new-plugin>
```

`<full-path-to-new-plugin>` can point anywhere on disk, inside or outside the repo — e.g. `~/Documents/repo/plugins/my-plugin`. The command:

1. Scaffolds a working plugin project at that path (rsbuild + module-federation config, a placeholder `App`/`bootstrap`/`ProviderComponent`, a mock context for local preview).
2. Syncs in the host's `UI/` component library and design tokens.
3. Syncs `frontend-plugin-types` into `<parent-of-plugin>/frontend-plugin-types` — a sibling folder shared by every plugin under that same parent, not copied per-plugin.
4. Merges the dependencies the CLI manages into `package.json` without touching any you've added yourself.

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
| **Always overwritten** — host is authoritative | Every sync fully replaces the destination. Any hand-edit is discarded on the next run. | The entire `UI/` folder ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)); `frontend-plugin-types` ([`syncPluginTypes.ts`](../../frontend-scripts/soilhive-plugin/syncPluginTypes.ts)); the design-token partials `styles/variables/_colors.scss` and `_typography.scss` |
| **Copied once, then dev-owned** | Only written if missing. Yours to edit afterward; the CLI never touches it again. | All scaffold files — `rsbuild.config.ts`, `module-federation.config.ts`, `tsconfig.json`, `pnpm-workspace.yaml`, `src/App.tsx`, `src/bootstrap.tsx`, `src/components/ProviderComponent.tsx`, `src/mockContext.ts`, etc. ([`scaffold.ts`](../../frontend-scripts/soilhive-plugin/scaffold.ts)); `styles/base.scss`, `styles/fonts.scss`, `styles/variables/_breakpoints.scss`, and the plugin's `styles/index.scss` |
| **Generated, then dev-owned** | Written once from a filtered copy of the host's file, not a byte-for-byte copy. | `styles/index.scss` — mirrors the host's `frontend/src/styles/index.scss` but drops the `prime.react.override` import and the `primereact`/`react-loading-skeleton` package CSS, since nothing in `UI/` depends on either ([`syncUi.ts`](../../frontend-scripts/soilhive-plugin/syncUi.ts)) |
| **Merged, not overwritten** | `package.json`'s CLI-managed keys are updated in place; anything you've added stays. | `dependencies.react`, `dependencies['react-dom']`, `dependencies['frontend-plugin-types']`, plus every non-relative package a live scan of `UI/`'s actual imports turns up — each pinned to the exact version in the host's `frontend/package.json` ([`packageJson.ts`](../../frontend-scripts/soilhive-plugin/packageJson.ts)) |
| **Never copied** | Refused even if a `neverCopy` path is passed to the copy engine. | `SoilhiveMap.scss`, `prime.react.override.scss` — nothing in `UI/` needs either, and the plugin template deliberately doesn't carry a `primereact` dependency |

Practical consequence: **don't hand-edit anything inside `UI/`.** It's meant to be used as-is; the next sync silently discards changes there. Everything else the CLI writes is yours from the moment it's created — the CLI never re-touches it after the first write.

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
