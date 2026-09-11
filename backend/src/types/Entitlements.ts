import { Capability } from './enums';

/** Flat slug/key -> capability-list map, scoped to a single namespace (see `EntitlementScope`). */
export type CapabilityGrants = Record<string, Capability[]>;

/**
 * Namespaced by scope: keys are slugs (`datasets`) or freeform config keys (`configs`); values
 * are capability lists. Both scopes are optional: a raw DB row may genuinely lack a scope it has
 * never been written under (the migration only guarantees `datasets`), and most callers that
 * build a `RequestData` don't care about entitlements at all and pass `{}` as a "none" sentinel —
 * requiring both keys everywhere would force that unrelated ceremony onto every such call site.
 * Code that actually reads a scope defaults it with `?? {}`.
 */
export type Entitlements = {
  datasets?: CapabilityGrants;
  configs?: CapabilityGrants;
};

/** Every namespace `data` can be scoped by, entity-backed or not (see `EntityScope`). */
export enum EntitlementScope {
  DATASETS = 'datasets',
  CONFIGS = 'configs',
}

/**
 * Scopes whose keys identify an entity with a slug history (see `EntitlementService.resolveSlugs`
 * / `expandAcrossSlugHistory`).
 *
 * `configs` has no write path at the moment: `getEntityEntitlements`/`setEntityEntitlements`/
 * `deleteEntityEntitlements` are restricted to `EntityScope`  and no endpoint calls them with `configs`. A
 * future ticket adds how one gets written.
 */
export type EntityScope = Exclude<EntitlementScope, EntitlementScope.CONFIGS>;
