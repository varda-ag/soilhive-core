import { assert } from 'console';
import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { EVERYONE, PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import { EntitlementsEntity } from '../entities/Entitlements';
import { RequestData } from '../interfaces/RequestData';
import { EntitlementScope, type Entitlements, type CapabilityGrants, type RequestScope } from '../types/Entitlements';
import { Capability } from '../types/enums';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { log } from '../utils/logger';
import { getEntitySlugs } from '../utils/slugs';
import { getSubject, isPrivilegedCaller } from '../utils/auth';
import DatasetEntity from '../entities/Dataset';

// Object.create(null), not {}: a key here can legitimately be "__proto__" (see the comment in
// getUserEntitlements for why that's dangerous on a plain object).
const emptyEntitlements = (): Entitlements => ({ datasets: Object.create(null), configs: Object.create(null) });

/**
 * Scopes whose keys are entity slugs, and so carry an identity that survives a rename.
 *
 * `CONFIGS` keys are freeform ids chosen by the caller of `PUT /config/{configId}`, with no entity
 * behind them. Resolving one through `slug_history` would alias it to every slug some unrelated
 * entity has ever held, so a config id that happens to equal a renamed dataset's old slug would
 * read, and delete, the grants of the config id equal to its new one. `getUserEntitlements` draws
 * this same line for the same reason; this is the single place both paths take it from.
 */
const ENTITY_BACKED_SCOPES: ReadonlySet<EntitlementScope> = new Set([EntitlementScope.DATASETS]);

/** De-duplicated union, for two grants that land on the same slug after `expandAcrossSlugHistory`. */
const mergeCapabilities = (existing: Capability[] | undefined, incoming: Capability[]): Capability[] =>
  Array.from(new Set([...(existing ?? []), ...(Array.isArray(incoming) ? incoming : [])])).sort();

/** One entry of the external provider's reply: a plain object whose own values are all capability lists. */
const isEntitlementsEntry = (entry: unknown): entry is CapabilityGrants =>
  typeof entry === 'object' &&
  entry !== null &&
  !Array.isArray(entry) &&
  Object.values(entry as Record<string, unknown>).every(value => Array.isArray(value));

/**
 * External entitlement providers are expected to reply with an array of `{slug: capabilities}`
 * entries — one per grant — not a single flat object, for example:
 *
 * ```json
 * [
 *   { "dataset-1": ["preview", "download"] },
 *   { "dataset-2": ["preview"] }
 * ]
 * ```
 *
 * Adapts that agreed shape into the flat, scoped map used everywhere else (in the example above:
 * `{ "dataset-1": ["preview", "download"], "dataset-2": ["preview"] }`). Anything that doesn't
 * match it is untrusted: log it and discard the whole reply, the same "degrade to local-only"
 * behavior already used for a failed fetch, rather than guessing at a shape nobody has agreed to.
 *
 * Merges into `Object.create(null)`, not `{}` — same "__proto__" key risk as `getUserEntitlements`,
 * except `Object.assign` would actually pull it off (unlike `JSON.parse`), since it writes each
 * key through a normal assignment rather than defining it.
 */
const parseExternalEntitlements = (body: unknown): CapabilityGrants => {
  if (!Array.isArray(body) || !body.every(isEntitlementsEntry)) {
    log.error('External entitlements endpoint replied in an unexpected shape, discarding its response', { body: JSON.stringify(body) });
    return Object.create(null);
  }
  return Object.assign(Object.create(null), ...body);
};

export default class EntitlementService {
  // Object.create(null): a subject id can legitimately be "__proto__" — same risk as
  // getUserEntitlements's merge loop, but here `acc[id] = ...` is a plain assignment, so it
  // would silently repoint acc's prototype rather than crash.
  private entitiesToEntitlements = (entities: EntitlementsEntity[], scope: EntitlementScope, slugs: string[]): CapabilityGrants => {
    return entities.reduce(
      (acc, { id, data }) => {
        const scopedData = data[scope] ?? {};
        const key = slugs.find(k => k in scopedData);
        assert(key, 'Key should be found in data');
        const capabilities = scopedData[key!]!;
        if (!Array.isArray(capabilities)) {
          log.warn(`Skipping malformed entitlement grant for ${scope}.${key}: not an array`);
          return acc;
        }
        acc[id] = capabilities;
        return acc;
      },
      Object.create(null) as CapabilityGrants,
    );
  };

  /**
   * All the keys an entitlement to this entity may be stored under: every slug the entity has
   * ever had, since entitlements are written with whatever slug was current at the time. Reads
   * and deletes must resolve identity the same way, or a rename leaves keys that are still
   * honoured on read but missed on delete — hence the single helper (see ADR 0027).
   *
   * Only for scopes keyed by entity slug. A key in any other scope is an opaque id and is its own
   * only spelling, so it is returned as given without consulting `slug_history` at all.
   */
  private resolveSlugs = async (requestData: RequestData, scope: EntitlementScope, slug: string): Promise<string[]> => {
    if (!ENTITY_BACKED_SCOPES.has(scope)) {
      return [slug];
    }
    const slugs = await getEntitySlugs(requestData, slug);
    if (slugs.length === 0) {
      // This handles entitlements for "non-entities" (e.g.: "spatial_filter")
      // that do not have a slug in the system
      slugs.push(slug);
    }
    return slugs;
  };

  getEntityEntitlements = async (requestData: RequestData, scope: EntitlementScope, slug: string): Promise<CapabilityGrants> => {
    // 1. Get all slugs related to the same entity (this handles slug history)
    const slugs = await this.resolveSlugs(requestData, scope, slug);
    // 2. Get all entitlements that match any of the slugs, within this scope's own sub-object
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entities = await repo.createQueryBuilder('ent').where('ent.data->:scope ?| array[:...slugs]', { scope, slugs }).getMany();
    return this.entitiesToEntitlements(entities, scope, slugs);
  };

  setEntityEntitlements = async (
    requestData: RequestData,
    scope: EntitlementScope,
    slug: string,
    entitlements: CapabilityGrants,
  ): Promise<CapabilityGrants> => {
    // 1. Remove all entitlements
    await this.deleteEntityEntitlements(requestData, scope, slug);
    // 2. Group user IDs
    const ids = Object.keys(entitlements);
    if (ids.length === 0) {
      return {};
    }
    // 3. Find existing user entities
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entities = await repo.findBy({ id: In(ids) });
    // 4. Update existing entities
    for (const entity of entities) {
      entity.data[scope] = { ...entity.data[scope], [slug]: entitlements[entity.id]! };
    }
    // 5. Create entities for missing user IDs
    const missingIds = ids.filter(id => !entities.some(e => e.id === id));
    for (const id of missingIds) {
      const newEntity = repo.create({ id, data: { ...emptyEntitlements(), [scope]: { [slug]: entitlements[id] } } });
      entities.push(newEntity);
    }
    // 6. Persist the changes
    await repo.save(entities);
    return this.entitiesToEntitlements(entities, scope, [slug]);
  };

  /**
   * Strips every key this entity's entitlements may be stored under, across all subjects, within
   * this scope's own sub-object only. Rows left with an empty scope (or an empty `data` overall)
   * are kept: the row is a subject record rather than an entitlement, and the subject is retained
   * throughout the schema anyway (`created_by`).
   */
  deleteEntityEntitlements = async (requestData: RequestData, scope: EntitlementScope, slug: string): Promise<void> => {
    const slugs = await this.resolveSlugs(requestData, scope, slug);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    await repo
      .createQueryBuilder('ent')
      .update(EntitlementsEntity)
      .set({
        // Rewrite only the scope's own sub-object, with the listed slugs stripped from it —
        // `jsonb - text[]` drops every listed key in one pass.
        data: () => `jsonb_set(data, array[:scope]::text[], COALESCE(data->:scope, '{}'::jsonb) - array[:...slugs]::text[])`,
      })
      // Without this predicate the update rewrites and row-locks the whole table, which a
      // caller running inside a long transaction (the purge) would hold for its duration.
      // Matches the scope's own GIN index (idx_entitlements_data_datasets_gin /
      // idx_entitlements_data_configs_gin). Unaliased: an UPDATE emits no table alias, so
      // `ent.` would not resolve here.
      .where('data->:scope ?| array[:...slugs]')
      .setParameters({ scope, slugs })
      .execute();
  };

  /**
   * Slices merged `entitlements` down to what a `GET /entitlements?scope=` caller asked for.
   * `DATASETS`/`CONFIGS` are real storage namespaces — passed through unfiltered. Any other
   * `scope` is a config subkey prefix: a virtual filter over `configs`, not a namespace of its
   * own, so it never looks at `entitlements.datasets` at all. A key matches either exactly (the
   * singleton case, e.g. a lone `dashboards` entry with no suffix) or as `${scope}_...` (the
   * multi-entry case, e.g. `dashboards_1`, `dashboards_2`) — `startsWith` alone would miss the
   * singleton case.
   *
   * A plugin-owned key (`plugin:${pluginId}:${id}`, see `PLUGIN_CONFIG_ID_PATTERN`) is matched on
   * its `id` part alone — `plugin:weather-widget:dashboards_1` counts as a `dashboards` entry the
   * same way `dashboards_1` does — since the subkey convention is a property of what a plugin
   * named its own config, not of the plugin namespace wrapped around it. The full key (prefix
   * included) is what's returned, so the caller still knows which config it is.
   */
  selectByScope = (entitlements: Entitlements, scope: RequestScope): CapabilityGrants => {
    if (scope === EntitlementScope.DATASETS || scope === EntitlementScope.CONFIGS) {
      return entitlements[scope] ?? {};
    }
    const configs = entitlements.configs ?? {};
    const matchesSubkey = (key: string): boolean => {
      const id = PLUGIN_CONFIG_ID_PATTERN.exec(key)?.[2] ?? key;
      return id === scope || id.startsWith(`${scope}_`);
    };
    return Object.fromEntries(Object.entries(configs).filter(([key]) => matchesSubkey(key)));
  };

  async getUserEntitlements(requestData: RequestData, id?: string): Promise<Entitlements> {
    // Local DB entitlements are added on top of external entitlements
    const externalEntitlements = await this.callEntitlementsEndpoint(requestData);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const rows = (await repo.find({ where: { id: In([EVERYONE, id]) } })).sort((a, _) => (a.id === EVERYONE ? -1 : 1));
    const merged = rows.reduce((acc, { data }) => {
      for (const scope of Object.values(EntitlementScope)) {
        // Object.create(null), not {}: a stored key can legitimately be "__proto__". On a plain
        // {}, target["__proto__"] reads back Object.prototype (truthy, not iterable) instead of
        // undefined, so the init check below is skipped and the spread on the next line crashes.
        // A null-prototype target has no such built-in property, so "__proto__" behaves like any
        // other key that hasn't been set yet.
        const target = (acc[scope] ??= Object.create(null));
        const scopedData = data[scope] ?? {};
        for (const key in scopedData) {
          const capabilities = scopedData[key]!;
          if (!Array.isArray(capabilities)) {
            log.warn(`Skipping malformed entitlement grant for ${scope}.${key}: not an array`);
            continue;
          }
          if (!target[key]) {
            target[key] = [];
          }
          target[key] = Array.from(new Set([...target[key], ...capabilities]));
        }
      }
      return acc;
    }, externalEntitlements); // Using external entitlements as the accumulator base — itself built null-prototype, see emptyEntitlements/parseExternalEntitlements

    // Only ENTITY_BACKED_SCOPES need slug-history expansion (today: datasets). `configs` keys are
    // freeform, with no entity behind them, so they pass through untouched — this is the seam a
    // future entity-backed scope would join, in step with that constant and `resolveSlugs`.
    return {
      datasets: await this.expandAcrossSlugHistory(requestData, merged.datasets ?? {}),
      configs: merged.configs ?? {},
    };
  }

  /**
   * `entitlements` is keyed by slug, and some keys may be historical — a grant is written under
   * whatever slug is current at the time (see `setEntityEntitlements`) and is never rewritten on
   * a later rename. A caller should be able to look up an entity's entitlement by *any* slug it
   * has ever had, old or current, and get the same value. This expands the merged map so every
   * slug in an entity's history carries the same, merged capability list — cost scales with
   * grants held, not with whatever listing a caller later checks them against.
   *
   * Not scoped to Dataset: any entity type can hold entitlements, and slug_history's rename
   * trigger already covers several (datasets, soil_properties, procedures, licenses, ...).
   *
   * A key matching no entity at all (e.g. `spatial_filter`) is left exactly as given.
   */
  private expandAcrossSlugHistory = async (requestData: RequestData, entitlements: CapabilityGrants): Promise<CapabilityGrants> => {
    const slugs = Object.keys(entitlements);
    if (slugs.length === 0) {
      return entitlements;
    }

    // For each input slug that matches a known entity, this returns one row per slug that
    // entity has ever had (including the input slug itself). No "latest row only" restriction:
    // we want the full set of related slugs, not just the current one.
    const rows: { input_slug: string; entity_id: string; related_slug: string }[] = await requestData.entityManager.query(
      `SELECT sh.slug AS input_slug, sh.entity_id, all_slugs.slug AS related_slug
       FROM slug_history sh
       INNER JOIN slug_history all_slugs ON all_slugs.entity_id = sh.entity_id
       WHERE sh.slug = ANY($1::text[])`,
      [slugs],
    );
    if (rows.length === 0) {
      return entitlements;
    }

    // Group by entity: which of the input slugs matched it (to gather capabilities from), and
    // every slug it has ever had (to write the merged result to).
    const inputSlugsByEntity = new Map<string, Set<string>>();
    const relatedSlugsByEntity = new Map<string, Set<string>>();
    for (const { input_slug, entity_id, related_slug } of rows) {
      if (!inputSlugsByEntity.has(entity_id)) {
        inputSlugsByEntity.set(entity_id, new Set());
        relatedSlugsByEntity.set(entity_id, new Set());
      }
      inputSlugsByEntity.get(entity_id)!.add(input_slug);
      relatedSlugsByEntity.get(entity_id)!.add(related_slug);
    }

    const matchedInputSlugs = new Set(rows.map(row => row.input_slug));
    // Object.create(null): same "__proto__" risk as entitiesToEntitlements — `expanded[slug] = ...`
    // below is a plain assignment, which would otherwise hijack the prototype instead of storing it.
    const expanded: CapabilityGrants = Object.create(null);

    // Unmatched keys (e.g. spatial_filter) pass through unchanged.
    for (const slug of slugs) {
      if (!matchedInputSlugs.has(slug)) {
        expanded[slug] = entitlements[slug]!;
      }
    }

    // For each entity, merge the capabilities held under any of its matched input slugs, then
    // write that merged list under every slug the entity has ever had.
    for (const [entityId, matchedSlugsForEntity] of inputSlugsByEntity) {
      let merged: Capability[] = [];
      for (const inputSlug of matchedSlugsForEntity) {
        merged = mergeCapabilities(merged, entitlements[inputSlug]!);
      }
      for (const relatedSlug of relatedSlugsByEntity.get(entityId)!) {
        expanded[relatedSlug] = merged;
      }
    }

    return expanded;
  };

  async callEntitlementsEndpoint(requestData: RequestData): Promise<Entitlements> {
    if (!process.env.ENTITLEMENTS_ENDPOINT || !requestData.token?.raw) {
      return emptyEntitlements();
    }
    try {
      const response = await fetch(process.env.ENTITLEMENTS_ENDPOINT!, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${requestData.token?.raw}`,
        },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`status ${response.status}: ${message}`);
      }
      // The external contract stays a flat map, unaffected by this app's own scoping — wrap it
      // under "datasets", the only scope it's ever spoken for (see ADR-0032).
      return { datasets: parseExternalEntitlements(await response.json()), configs: {} };
    } catch (error) {
      log.error('Failed to fetch entitlements from external endpoint, degrading to local entitlements only', {
        error: getErrorMessage(error),
      });
      return emptyEntitlements();
    }
  }

  /**
   * Domain-level read gate for `GET /config/{configId}/entitlements`: the response is the full
   * multi-subject grants map (every subject's email/id and their capabilities for the config), so
   * only a privileged caller or someone who already holds `READ` or `WRITE` on the config gets to
   * see it. Unlike the write gate, there is no "first access" bypass: if nobody holds a grant yet,
   * a non-privileged caller by definition holds neither capability either, so this falls out of
   * the same capability check without a separate branch.
   */
  assertCanReadConfigEntitlement = async (requestData: RequestData, key: string): Promise<void> => {
    if (isPrivilegedCaller(requestData.token)) {
      return;
    }

    const callerCapabilities = requestData.entitlements[EntitlementScope.CONFIGS]?.[key];
    if (!callerCapabilities?.some(capability => capability === Capability.READ || capability === Capability.WRITE)) {
      throw new ErrorResponse(`User does not have read entitlement for config ${key}`, StatusCodes.FORBIDDEN);
    }
  };

  /**
   * Domain-level write gate for `PUT /config/{configId}/entitlements`, distinct from
   * `enforceEntitlements`: that method carries dataset-visibility filtering that has no analogue
   * here. A non-admin caller may write a config's entitlements only if they already hold `WRITE`
   * on it — there is no "first access" bootstrap here (see `ConfigService.putConfig`, which is
   * where first access on the config *value* now lives, via `grantSelfConfigWrite`).
   */
  assertCanWriteConfigEntitlement = async (requestData: RequestData, key: string): Promise<void> => {
    if (isPrivilegedCaller(requestData.token)) {
      return;
    }

    const callerCapabilities = requestData.entitlements[EntitlementScope.CONFIGS]?.[key];
    if (!callerCapabilities?.includes(Capability.WRITE)) {
      throw new ErrorResponse(`User does not have write entitlement for config ${key}`, StatusCodes.FORBIDDEN);
    }
  };

  /**
   * Grants `WRITE` on a config key to the caller's own subject only, merging into whatever
   * grants that subject already holds (idempotent — a repeat call is a no-op, not a duplicate).
   * Called by `ConfigService.putConfig` after a caller wins the first-access race on a fresh
   * `plugin:` config id (see the `PLUGIN_CONFIG_ID_PATTERN` bootstrap there); runs inside that
   * same request transaction, so the row write and the grant are atomic as a unit.
   */
  grantSelfConfigWrite = async (requestData: RequestData, key: string): Promise<void> => {
    const subject = getSubject(requestData);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entity = await repo.findOneBy({ id: subject });
    if (!entity) {
      await repo.save(repo.create({ id: subject, data: { ...emptyEntitlements(), configs: { [key]: [Capability.WRITE] } } }));
      return;
    }
    const configs = entity.data.configs ?? {};
    entity.data = { ...entity.data, configs: { ...configs, [key]: mergeCapabilities(configs[key], [Capability.WRITE]) } };
    await repo.save(entity);
  };

  /**
   * `PUT /config/{configId}/entitlements`'s single entry point: composes the write gate with the
   * generic writer so a caller can't reach `setEntityEntitlements(CONFIGS, ...)` without the check
   * running first — the gate has no other production caller to enforce that ordering itself.
   */
  setConfigEntitlement = async (requestData: RequestData, key: string, entitlements: CapabilityGrants): Promise<CapabilityGrants> => {
    await this.assertCanWriteConfigEntitlement(requestData, key);
    return this.setEntityEntitlements(requestData, EntitlementScope.CONFIGS, key, entitlements);
  };

  /**
   * `GET /config/{configId}/entitlements`'s single entry point: composes the read gate with the
   * generic reader, same reasoning as `setConfigEntitlement`.
   *
   * The generic reader returns every subject holding a grant — every other subject's email/id, not
   * only the caller's own. That's fine for a privileged caller or a `WRITE` holder (managing the
   * ACL needs to see it in full), but a caller let in on `READ` alone would otherwise turn this
   * into an email-enumeration endpoint for anyone the config's (non-admin) owner ever grants
   * `READ` to — including `EVERYONE`, which a non-admin owner can grant same as any other subject.
   * A `READ`-only caller is therefore handed only their own entry, plus `EVERYONE`'s (never an
   * individual identity, so safe to reveal — and how the caller can tell their `READ` came from
   * being individually named vs. covered by `EVERYONE`).
   */
  getConfigEntitlement = async (requestData: RequestData, key: string): Promise<CapabilityGrants> => {
    await this.assertCanReadConfigEntitlement(requestData, key);
    const grants = await this.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, key);

    const callerCapabilities = requestData.entitlements[EntitlementScope.CONFIGS]?.[key];
    const canSeeFullGrantList = isPrivilegedCaller(requestData.token) || callerCapabilities?.includes(Capability.WRITE);
    if (canSeeFullGrantList) {
      return grants;
    }

    const subject = getSubject(requestData);
    return Object.fromEntries(Object.entries(grants).filter(([grantee]) => grantee === subject || grantee === EVERYONE));
  };

  async enforceEntitlements(requestData: RequestData, scope: EntitlementScope, keys: string[], capability: Capability): Promise<void> {
    if (isPrivilegedCaller(requestData.token)) {
      // Internal requests and admins bypass entitlements checks
      return;
    }

    // The "public bypasses entitlements" rule only exists for datasets (a Dataset property);
    // there is no analogous concept — and so no analogous bypass — for `configs`.
    let keysToCheck = keys;
    if (scope === EntitlementScope.DATASETS) {
      const repo = requestData.entityManager.getRepository(DatasetEntity);
      const results = await repo.find({
        select: { slug: true, visibility: true },
        where: { slug: In(keys) },
      });
      keysToCheck = results.filter(r => r.visibility === 'private').map(r => r.slug);
    }

    const scopedEntitlements = requestData.entitlements[scope] ?? {};
    for (const key of keysToCheck) {
      if (!scopedEntitlements[key] || !scopedEntitlements[key]!.includes(capability)) {
        throw new ErrorResponse(`User does not have ${capability} entitlement for ${scope} ${key}`, StatusCodes.FORBIDDEN);
      }
    }
  }
}
