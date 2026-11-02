import { createHash } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { LRUCache } from 'lru-cache';
import { In } from 'typeorm';
import { EVERYONE, PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import { EntitlementsEntity } from '../entities/Entitlements';
import { RequestData } from '../interfaces/RequestData';
import { ConfigKind, EntitlementScope, type Entitlements, type CapabilityGrants, type RequestScope } from '../types/Entitlements';
import { Capability } from '../types/enums';
import { isCacheBypassed } from '../utils/cache-bypass';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { log } from '../utils/logger';
import { existingDatasets, getEntitySlugs } from '../utils/slugs';
import { datasetCapabilities, getSubject, isPrivilegedCaller } from '../utils/auth';
import { getEntitlementsCacheTtlMs } from '../utils/utils';
import { JsonStorage } from '../entities/JsonStorage';

/**
 * An empty grants map. Null-prototype because a key can legitimately be "__proto__": on a plain
 * `{}` it reads back Object.prototype, and assigning it repoints the prototype instead of storing.
 */
const grantsMap = (): CapabilityGrants => Object.create(null);

const emptyEntitlements = (): Entitlements => ({ datasets: grantsMap(), configs: grantsMap() });

/**
 * A copy of `entitlements` that is safe to mutate: each scope and each capability list is new.
 * Not `structuredClone` or a spread into `{}`: both drop the null prototype (see grantsMap).
 */
const copyEntitlements = (entitlements: Entitlements): Entitlements => {
  const copy: Entitlements = {};
  for (const [scope, grants = {}] of Object.entries(entitlements)) {
    const scoped = grantsMap();
    for (const [key, capabilities] of Object.entries(grants)) {
      scoped[key] = [...capabilities];
    }
    copy[scope as EntitlementScope] = scoped;
  }
  return copy;
};

/**
 * The external endpoint's reply per token, keyed by the token's sha256 (see ADR-0062). Per process
 * and module-level, so every `EntitlementService` instance shares it. A valid reply stays for the
 * whole TTL: a change made by the external provider shows only after the entry expires. Values are
 * never handed out directly, only through `copyEntitlements`.
 */
const entitlementsCache = new LRUCache<string, Entitlements>({ max: 1000 });

/** Fetches still running, per token hash, so parallel requests with one token share a single call. */
const inFlightEntitlements = new Map<string, Promise<Entitlements | undefined>>();

/** Test hook: drop all cached replies and forget the calls still running. */
export const resetEntitlementsCache = (): void => {
  entitlementsCache.clear();
  inFlightEntitlements.clear();
};

/** Whether `scope` is a Config Kind (a filtered view over `configs`, see `selectByScope`) rather than a storage namespace. */
const isConfigKind = (scope: RequestScope): scope is ConfigKind => Object.values<string>(ConfigKind).includes(scope);

/** De-duplicated, sorted union of two capability lists. */
const mergeCapabilities = (existing: Capability[] | undefined, incoming: Capability[]): Capability[] =>
  Array.from(new Set([...(existing ?? []), ...incoming])).sort();

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
 * Returns `undefined` for a discarded reply, so it is not cached as if it were a valid empty one.
 */
const parseExternalEntitlements = (body: unknown): CapabilityGrants | undefined => {
  if (!Array.isArray(body) || !body.every(isEntitlementsEntry)) {
    log.error('External entitlements endpoint replied in an unexpected shape, discarding its response', { body: JSON.stringify(body) });
    return undefined;
  }
  return Object.assign(grantsMap(), ...body);
};

/** The config gates' one rule: `write` implies `read`. */
const grantsConfig = (capabilities: Capability[] | undefined, capability: Capability.READ | Capability.WRITE): boolean =>
  capability === Capability.WRITE
    ? (capabilities?.includes(Capability.WRITE) ?? false)
    : Boolean(capabilities?.some(granted => granted === Capability.READ || granted === Capability.WRITE));

/** The config gates' 403. */
export const configForbidden = (key: string, capability: Capability.READ | Capability.WRITE): ErrorResponse =>
  new ErrorResponse(`User does not have ${capability} entitlement for config ${key}`, StatusCodes.FORBIDDEN);

export default class EntitlementService {
  private entitiesToEntitlements = (entities: EntitlementsEntity[], scope: EntitlementScope, slugs: string[]): CapabilityGrants => {
    return entities.reduce((acc, { id, data }) => {
      const scopedData = data[scope] ?? {};
      const key = slugs.find(k => k in scopedData);
      const capabilities = key === undefined ? undefined : scopedData[key];
      if (!Array.isArray(capabilities)) {
        log.warn(`Skipping malformed entitlement grant for ${scope}.${key}: not an array`);
        return acc;
      }
      acc[id] = capabilities;
      return acc;
    }, grantsMap());
  };

  /**
   * All the keys a grant on this entity may be stored under. A Dataset grant is written under
   * whatever slug was current at the time, so that is every slug the Dataset has held; reads and
   * deletes must resolve it alike (see ADR 0027). A config id is its own only key: resolving it
   * through slug history would alias it to every slug an unrelated entity has held.
   */
  private resolveSlugs = async (requestData: RequestData, scope: EntitlementScope, slug: string): Promise<string[]> => {
    if (scope !== EntitlementScope.DATASETS) {
      return [slug];
    }
    const slugs = await getEntitySlugs(requestData, slug);
    // A key with no entity behind it (e.g. "spatial_filter") is its own only key too
    return slugs.length > 0 ? slugs : [slug];
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
   * `DATASETS`/`CONFIGS` pass through unfiltered. A Config Kind keeps the `configs` keys whose id,
   * after any Plugin Namespace, is `${kind}:` plus a non-empty id; full keys are returned.
   */
  selectByScope = (entitlements: Entitlements, scope: RequestScope): CapabilityGrants => {
    if (!isConfigKind(scope)) {
      return entitlements[scope] ?? {};
    }
    const configs = entitlements.configs ?? {};
    const prefix = `${scope}:`;
    const hasKind = (key: string): boolean => {
      const id = PLUGIN_CONFIG_ID_PATTERN.exec(key)?.[2] ?? key;
      return id.length > prefix.length && id.startsWith(prefix);
    };
    return Object.fromEntries(Object.entries(configs).filter(([key]) => hasKind(key)));
  };

  /**
   * `GET /entitlements?scope=`: the grants held, sliced to `scope`. A Privileged caller also gets
   * READ and WRITE on every (non-deleted) config row for a config scope (`configs` or a Config Kind): it
   * bypasses the config gates (`canConfig`) but holds no grants, so its grants alone would list
   * nothing. Not part of `getUserEntitlements`, which also fills `requestData.entitlements` on every
   * request, where no gate would read the result.
   */
  getVisibleEntitlements = async (requestData: RequestData, scope: RequestScope): Promise<CapabilityGrants> => {
    const grants = await this.getUserEntitlements(requestData, getSubject(requestData));
    const isConfigScope = scope === EntitlementScope.CONFIGS || isConfigKind(scope);
    const entitlements =
      isConfigScope && isPrivilegedCaller(requestData.token) ? await this.addReadWriteOnEveryConfig(requestData, grants) : grants;
    return this.selectByScope(entitlements, scope);
  };

  private addReadWriteOnEveryConfig = async (requestData: RequestData, entitlements: Entitlements): Promise<Entitlements> => {
    const rows = await requestData.entityManager.getRepository(JsonStorage).find({ select: { id: true } });
    const configs: CapabilityGrants = Object.assign(grantsMap(), entitlements.configs);
    for (const { id } of rows) {
      configs[id] = mergeCapabilities(configs[id], [Capability.READ, Capability.WRITE]);
    }
    return { ...entitlements, configs };
  };

  async getUserEntitlements(requestData: RequestData, id?: string): Promise<Entitlements> {
    // Local DB entitlements are added on top of external entitlements
    const externalEntitlements = await this.callEntitlementsEndpoint(requestData);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const rows = await repo.find({ where: { id: In([EVERYONE, id]) } });
    // Seeded fresh, not with the external result: the merge never writes into an object it was given.
    const merged = emptyEntitlements();
    for (const data of [externalEntitlements, ...rows.map(row => row.data)]) {
      for (const scope of Object.values(EntitlementScope)) {
        const target = (merged[scope] ??= grantsMap());
        const scopedData = data[scope] ?? {};
        for (const key in scopedData) {
          const capabilities = scopedData[key]!;
          if (!Array.isArray(capabilities)) {
            log.warn(`Skipping malformed entitlement grant for ${scope}.${key}: not an array`);
            continue;
          }
          target[key] = mergeCapabilities(target[key], capabilities);
        }
      }
    }

    // Only Dataset keys are slugs; config keys are freeform ids and pass through (see resolveSlugs).
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
    const expanded = grantsMap();

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

  /**
   * The external grants for the caller's token, from the per-token cache when it holds them (see
   * ADR-0062). Parallel calls with one token share a single fetch. Only a valid reply is cached: an
   * error or a discarded reply degrades to no external grants and is fetched again next time.
   * A request with the cache-bypass header (ADR-0028), or any request while ENTITLEMENTS_CACHE_TTL_MS
   * is 0 or less, always fetches and leaves the cache untouched. A Plugin token gets no external
   * grants: its user's local grants only.
   */
  async callEntitlementsEndpoint(requestData: RequestData): Promise<Entitlements> {
    const raw = requestData.token?.raw;
    // A Plugin token is signed by the core: it never leaves for a third party (docs/adr/0065)
    if (!process.env.ENTITLEMENTS_ENDPOINT || !raw || requestData.token?.pluginId) {
      return emptyEntitlements();
    }
    const ttl = getEntitlementsCacheTtlMs();
    if (isCacheBypassed() || ttl <= 0) {
      return (await this.fetchExternalEntitlements(raw)) ?? emptyEntitlements();
    }
    const key = createHash('sha256').update(raw).digest('hex');
    const cached = entitlementsCache.get(key);
    if (cached) {
      return copyEntitlements(cached);
    }
    let pending = inFlightEntitlements.get(key);
    if (!pending) {
      pending = this.fetchExternalEntitlements(raw)
        .then(entitlements => {
          if (entitlements) {
            entitlementsCache.set(key, entitlements, { ttl });
          }
          return entitlements;
        })
        .finally(() => inFlightEntitlements.delete(key));
      inFlightEntitlements.set(key, pending);
    }
    const entitlements = await pending;
    return entitlements ? copyEntitlements(entitlements) : emptyEntitlements();
  }

  /** One call to the external endpoint. `undefined` when it fails or its reply is discarded. */
  private fetchExternalEntitlements = async (raw: string): Promise<Entitlements | undefined> => {
    try {
      const response = await fetch(process.env.ENTITLEMENTS_ENDPOINT!, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${raw}`,
        },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`status ${response.status}: ${message}`);
      }
      // The external contract stays a flat map, unaffected by this app's own scoping — wrap it
      // under "datasets", the only scope it's ever spoken for (see ADR-0032).
      const datasets = parseExternalEntitlements(await response.json());
      return datasets && { datasets, configs: {} };
    } catch (error) {
      log.error('Failed to fetch entitlements from external endpoint, degrading to local entitlements only', {
        error: getErrorMessage(error),
      });
      return undefined;
    }
  };

  /**
   * The config gates (see ADR 0037), over the grants loaded for the request. Synchronous, no DB
   * access, so `ConfigService.getConfigs` can filter with it.
   */
  canConfig = (requestData: RequestData, key: string, capability: Capability.READ | Capability.WRITE): boolean =>
    isPrivilegedCaller(requestData.token) || grantsConfig(requestData.entitlements[EntitlementScope.CONFIGS]?.[key], capability);

  assertConfig = (requestData: RequestData, key: string, capability: Capability.READ | Capability.WRITE): void => {
    if (!this.canConfig(requestData, key, capability)) {
      throw configForbidden(key, capability);
    }
  };

  /**
   * The same gates for one key, on a route that loads no entitlements (docs/adr/0041). Reads only
   * the caller's and EVERYONE's local grants for that key: config items are never granted by the
   * external endpoint, so neither that call nor slug expansion can change the answer.
   */
  canAccessConfig = async (requestData: RequestData, key: string, capability: Capability.READ | Capability.WRITE): Promise<boolean> => {
    if (isPrivilegedCaller(requestData.token)) {
      return true;
    }
    const subject = requestData.token ? getSubject(requestData) : undefined;
    const rows: { capabilities: unknown }[] = await requestData.entityManager.query(
      `SELECT "data"->'configs'->$1::text AS capabilities FROM "entitlements" WHERE "id" = ANY($2::text[]) AND "deleted_at" IS NULL`,
      [key, subject ? [EVERYONE, subject] : [EVERYONE]],
    );
    // A non-array grant is malformed and skipped, as getUserEntitlements skips it.
    const capabilities = rows.flatMap(row => (Array.isArray(row.capabilities) ? (row.capabilities as Capability[]) : []));
    return grantsConfig(capabilities, capability);
  };

  /**
   * Self-grants `WRITE` on `key` after `ConfigService.putConfig` wins a first-access race (ADR
   * 0054). An atomic `INSERT ... ON CONFLICT DO UPDATE`, not `findOneBy` + `save`: the same
   * subject can win several distinct ids concurrently, each its own transaction, all targeting
   * this one row — a read-modify-write would lose all but the last writer's key.
   *
   * Assumes `requestData.token` is set; unguarded because its one caller sits behind mandatory
   * `bearerAuth`.
   */
  grantSelfConfigWrite = async (requestData: RequestData, key: string): Promise<void> => {
    const subject = getSubject(requestData);
    await requestData.entityManager.query(
      `
      INSERT INTO "entitlements" ("id", "data")
      VALUES ($1, jsonb_build_object('configs', jsonb_build_object($2::text, '["write"]'::jsonb)))
      ON CONFLICT ("id") DO UPDATE SET "data" = jsonb_set(
        "entitlements"."data",
        '{configs}',
        COALESCE("entitlements"."data"->'configs', '{}'::jsonb) || jsonb_build_object(
          $2::text,
          (
            SELECT jsonb_agg(DISTINCT capability ORDER BY capability)
            FROM jsonb_array_elements_text(
              COALESCE("entitlements"."data"->'configs'->$2::text, '[]'::jsonb) || '["write"]'::jsonb
            ) AS capability
          )
        )
      )
      `,
      [subject, key],
    );
  };

  /**
   * `PUT /configs/{configId}/entitlements`'s single entry point: composes the write gate with the
   * generic writer so a caller can't reach `setEntityEntitlements(CONFIGS, ...)` without the check
   * running first — the gate has no other production caller to enforce that ordering itself.
   */
  setConfigEntitlement = async (requestData: RequestData, key: string, entitlements: CapabilityGrants): Promise<CapabilityGrants> => {
    this.assertConfig(requestData, key, Capability.WRITE);
    return this.setEntityEntitlements(requestData, EntitlementScope.CONFIGS, key, entitlements);
  };

  /**
   * `GET /configs/{configId}/entitlements`'s single entry point: composes the read gate with the
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
    this.assertConfig(requestData, key, Capability.READ);
    const grants = await this.getEntityEntitlements(requestData, EntitlementScope.CONFIGS, key);
    if (this.canConfig(requestData, key, Capability.WRITE)) {
      return grants;
    }

    const subject = getSubject(requestData);
    return Object.fromEntries(Object.entries(grants).filter(([grantee]) => grantee === subject || grantee === EVERYONE));
  };

  /**
   * The current slugs of the requested Datasets that exist for the caller (docs/adr/0057), once
   * `capability` is checked on each. Filters first: a 403 on an unpublished private Dataset would
   * confirm that it exists. Checks every Dataset it found, so no slug skips the check (docs/adr/0071).
   * With `requireAll`, an absent Dataset is a 404 instead of being left out (docs/adr/0073).
   */
  async enforceDatasetEntitlements(
    requestData: RequestData,
    slugs: string[],
    capability: Capability.PREVIEW | Capability.DOWNLOAD,
    options: { requireAll?: boolean } = {},
  ): Promise<string[]> {
    const datasets = await existingDatasets(requestData, slugs, options);
    const denied = datasets.find(dataset => !datasetCapabilities(requestData, dataset).includes(capability));
    if (denied) {
      throw new ErrorResponse(`User does not have ${capability} entitlement for datasets ${denied.slug}`, StatusCodes.FORBIDDEN);
    }
    return datasets.map(dataset => dataset.slug);
  }
}
