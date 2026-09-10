# ADR 0030: The plugin scaffold's i18next resource-registration logic is a reusable helper, not a fixed-name file

**Status:** Accepted

## Context

The `dashboards` plugin (in `soilhive-plugins`, ticket SP-5622) hand-built a pattern for a plugin to add its own translations to the host's shared `i18next` singleton: own namespace, `addResourceBundle()` guarded by `hasResourceBundle()`, called once on mount from the plugin's exposed entry point, never calling `init()` itself (see `soilhive-plugins/docs/adr/0002-plugin-adds-own-translations-to-shared-i18next-singleton.md`). The `soilhive-plugin` CLI now scaffolds this pattern by default for every new plugin, instead of every plugin author re-deriving it by hand.

The CLI's own `CLAUDE.md` documents a stray-file problem: the CLI can re-create `ProviderComponent.tsx`/`ProviderComponent.css`, two old scaffold files `dashboards` no longer imports after it renamed and moved its real entry point. Any new scaffolded file that assumes a fixed structure — "the plugin's exposed entry point is always named X" — can suffer the same fate once a plugin restructures.

The `addResourceBundle()` + guard logic is exactly this kind of structure-sensitive code: it must run once, on the exposed entry point's mount, before any component calls `t()`. If that logic were written directly inside a fixed-name scaffold file (e.g. inlined into `ProviderComponent.tsx`), a plugin that renames or moves its entry point — the same way `dashboards` did — would either lose the registration entirely or have to rediscover and reimplement it by hand, silently regressing to the pre-scaffold manual state.

## Decision

- The registration logic is extracted into a small, generic, copy-once helper module: `registerResourceBundle(namespace, resources)`. It contains only the guard (`hasResourceBundle`/`addResourceBundle` existence check + duplicate-registration guard) and no assumption about which file calls it.
- A plugin's exposed entry point — whatever it is named, wherever it lives — imports this helper by its own module path and calls it once, on mount, with its own namespace and resources. The scaffold's entry-point template (`ProviderComponent.tsx`) ships a commented example call, the same way it already ships a commented example `UI/` import.
- The standalone dev-only `i18next.init()` call lives in a separate file (`src/i18n.dev.ts`), imported only from the plugin's standalone preview entry (`App.tsx`), never from the exposed entry point — mirroring `dashboards`' `i18n.dev.ts` / `DashboardsPlugin.tsx` split. Only the host calls `init()` in production.

## Consequences

- If a plugin renames or moves its exposed entry point later, the only thing that needs to keep working is a relative import of `registerResourceBundle` from wherever the new entry point lives — the helper itself needs no update, and the CLI's own scaffold files stay untouched by the rename, unlike a pattern hard-coded into a fixed file.
- `registerResourceBundle` is copy-once ("copied once, then yours"), like every other scaffold file — the CLI never rewrites it after first creation, and a plugin author can extend or replace it if their needs outgrow the guard's assumptions.
- This decision only covers a plugin's own namespace. `Map/`'s `availability` namespace stays host-owned in production (unchanged, already automatic via the shared singleton) and is not seeded at all for standalone dev preview — Map's own text shows raw keys in that mode, accepted as a dev-only cosmetic limitation.

This decision passes the ADR test:

1. **Hard to reverse** — every new plugin is expected to depend on this helper's shape once it exists; changing it later means touching every plugin that adopted it.
2. **Surprising without context** — it is not obvious that this logic should be pulled out of the entry-point template into a separate, nameless-caller helper, especially given the SP-5622 reference implementation inlined it directly into `DashboardsPlugin.tsx`.
3. **Real trade-off** — a small extra indirection (one more file, one more import) versus resilience to the exact entry-point-rename failure mode the CLI's `CLAUDE.md` already documents as a known, recurring problem.
