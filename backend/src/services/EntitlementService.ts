import { assert } from 'console';
import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { EVERYONE } from '../constants/constants';
import { EntitlementsEntity } from '../entities/Entitlements';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import { EntitlementScope, type Entitlements, type EntityScope, type CapabilityGrants } from '../types/Entitlements';
import { Capability } from '../types/enums';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { log } from '../utils/logger';
import { getEntitySlugs } from '../utils/slugs';
import DatasetEntity from '../entities/Dataset';

const emptyEntitlements = (): Entitlements => ({ datasets: {}, configs: {} });

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
 */
const parseExternalEntitlements = (body: unknown): CapabilityGrants => {
  if (!Array.isArray(body) || !body.every(isEntitlementsEntry)) {
    log.error('External entitlements endpoint replied in an unexpected shape, discarding its response', { body: JSON.stringify(body) });
    return {};
  }
  return Object.assign({}, ...body);
};

export default class EntitlementService {
  private entitiesToEntitlements = (entities: EntitlementsEntity[], scope: EntityScope, slugs: string[]): CapabilityGrants => {
    return entities.reduce((acc, { id, data }) => {
      const scopedData = data[scope] ?? {};
      const key = slugs.find(k => k in scopedData);
      assert(key, 'Key should be found in data');
      acc[id] = scopedData[key!]!;
      return acc;
    }, {} as CapabilityGrants);
  };

  /**
   * All the keys an entitlement to this entity may be stored under: every slug the entity has
   * ever had, since entitlements are written with whatever slug was current at the time. Reads
   * and deletes must resolve identity the same way, or a rename leaves keys that are still
   * honoured on read but missed on delete — hence the single helper (see ADR 0027).
   */
  private resolveSlugs = async (requestData: RequestData, slug: string): Promise<string[]> => {
    const slugs = await getEntitySlugs(requestData, slug);
    if (slugs.length === 0) {
      // This handles entitlements for "non-entities" (e.g.: "spatial_filter")
      // that do not have a slug in the system
      slugs.push(slug);
    }
    return slugs;
  };

  getEntityEntitlements = async (requestData: RequestData, scope: EntityScope, slug: string): Promise<CapabilityGrants> => {
    // 1. Get all slugs related to the same entity (this handles slug history)
    const slugs = await this.resolveSlugs(requestData, slug);
    // 2. Get all entitlements that match any of the slugs, within this scope's own sub-object
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entities = await repo.createQueryBuilder('ent').where('ent.data->:scope ?| array[:...slugs]', { scope, slugs }).getMany();
    return this.entitiesToEntitlements(entities, scope, slugs);
  };

  setEntityEntitlements = async (
    requestData: RequestData,
    scope: EntityScope,
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
  deleteEntityEntitlements = async (requestData: RequestData, scope: EntityScope, slug: string): Promise<void> => {
    const slugs = await this.resolveSlugs(requestData, slug);
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

  async getUserEntitlements(requestData: RequestData, id?: string): Promise<Entitlements> {
    // Local DB entitlements are added on top of external entitlements
    const externalEntitlements = await this.callEntitlementsEndpoint(requestData);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const rows = (await repo.find({ where: { id: In([EVERYONE, id]) } })).sort((a, _) => (a.id === EVERYONE ? -1 : 1));
    const merged = rows.reduce((acc, { data }) => {
      for (const scope of Object.values(EntitlementScope)) {
        const target = (acc[scope] ??= {});
        const scopedData = data[scope] ?? {};
        for (const key in scopedData) {
          if (!target[key]) {
            target[key] = [];
          }
          const capabilities = scopedData[key]!;
          target[key] = Array.from(new Set([...target[key], ...capabilities]));
        }
      }
      return acc;
    }, externalEntitlements); // Using external entitlements as the accumulator base

    // Only entity-backed scopes need slug-history expansion (today: datasets). `configs` keys
    // are freeform, with no entity behind them, so they pass through untouched — this is the
    // seam a future entity-backed scope would join.
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
    const expanded: CapabilityGrants = {};

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
   * Internal requests and admins bypass entitlements checks entirely (see enforceEntitlements) —
   * regardless of dataset ownership, not just for datasets they created themselves. Shared here
   * so the bypass has one definition instead of drifting between the enforcement check and the
   * capability list the frontend renders from.
   */
  private isEntitlementsBypassed = (token?: Token): boolean => {
    return Boolean(token?.isInternalRequest || token?.isDataAdmin || token?.isSuperAdmin);
  };

  async enforceEntitlements(requestData: RequestData, scope: EntitlementScope, keys: string[], capability: Capability): Promise<void> {
    if (this.isEntitlementsBypassed(requestData.token)) {
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
