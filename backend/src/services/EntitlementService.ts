import { assert } from 'console';
import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { EVERYONE } from '../constants/constants';
import { EntitlementsEntity } from '../entities/Entitlements';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import { type Entitlements } from '../types/Entitlements';
import { Capability } from '../types/enums';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { log } from '../utils/logger';
import { getEntitySlugs } from '../utils/slugs';
import DatasetEntity from '../entities/Dataset';

/** De-duplicated union, for two grants that land on the same slug after `expandAcrossSlugHistory`. */
const mergeCapabilities = (existing: Capability[] | undefined, incoming: Capability[]): Capability[] =>
  Array.from(new Set([...(existing ?? []), ...incoming])).sort();

export default class EntitlementService {
  private entitiesToEntitlements = (entities: EntitlementsEntity[], slugs: string[]): Entitlements => {
    return entities.reduce((acc, { id, data }) => {
      const key = slugs.find(k => k in data);
      assert(key, 'Key should be found in data');
      acc[id] = data[key!]!;
      return acc;
    }, {} as Entitlements);
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

  getEntityEntitlements = async (requestData: RequestData, slug: string): Promise<Entitlements> => {
    // 1. Get all slugs related to the same entity (this handles slug history)
    const slugs = await this.resolveSlugs(requestData, slug);
    // 2. Get all entitlements that match any of the slugs
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entities = await repo.createQueryBuilder('ent').where('ent.data ?| array[:...slugs]', { slugs }).getMany();
    return this.entitiesToEntitlements(entities, slugs);
  };

  setEntityEntitlements = async (requestData: RequestData, slug: string, entitlements: Entitlements): Promise<Entitlements> => {
    // 1. Remove all entitlements
    await this.deleteEntityEntitlements(requestData, slug);
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
      entity.data[slug] = entitlements[entity.id]!;
    }
    // 5. Create entities for missing user IDs
    const missingIds = ids.filter(id => !entities.some(e => e.id === id));
    for (const id of missingIds) {
      const newEntity = repo.create({ id, data: { [slug]: entitlements[id] } });
      entities.push(newEntity);
    }
    // 6. Persist the changes
    await repo.save(entities);
    return this.entitiesToEntitlements(entities, [slug]);
  };

  /**
   * Strips every key this entity's entitlements may be stored under, across all subjects.
   * Rows left with an empty `data` are kept: the row is a subject record rather than an
   * entitlement, and the subject is retained throughout the schema anyway (`created_by`).
   */
  deleteEntityEntitlements = async (requestData: RequestData, slug: string): Promise<void> => {
    const slugs = await this.resolveSlugs(requestData, slug);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    await repo
      .createQueryBuilder('ent')
      .update(EntitlementsEntity)
      .set({
        // `jsonb - text[]` drops every listed key in one pass
        data: () => 'data - array[:...slugs]::text[]',
      })
      // Without this predicate the update rewrites and row-locks the whole table, which a
      // caller running inside a long transaction (the purge) would hold for its duration.
      // Matches the GIN index on `data` (idx_entitlements_data_gin). Unaliased: an UPDATE
      // emits no table alias, so `ent.` would not resolve here.
      .where('data ?| array[:...slugs]')
      .setParameter('slugs', slugs)
      .execute();
  };

  async getUserEntitlements(requestData: RequestData, id?: string): Promise<Entitlements> {
    // Local DB entitlements are added on top of external entitlements
    const externalEntitlements = await this.callEntitlementsEndpoint(requestData);
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entitlements = (await repo.find({ where: { id: In([EVERYONE, id]) } })).sort((a, _) => (a.id === EVERYONE ? -1 : 1));
    const merged = entitlements.reduce((acc, { data }) => {
      for (const key in data) {
        if (!acc[key]) {
          acc[key] = [];
        }
        const capabilities = data[key]!;
        acc[key] = Array.from(new Set([...acc[key], ...capabilities]));
      }
      return acc;
    }, externalEntitlements); // Using external entitlements as the accumulator base
    return this.expandAcrossSlugHistory(requestData, merged);
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
  private expandAcrossSlugHistory = async (requestData: RequestData, entitlements: Entitlements): Promise<Entitlements> => {
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
    const expanded: Entitlements = {};

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
      return {};
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
      return await response.json();
    } catch (error) {
      log.error('Failed to fetch entitlements from external endpoint, degrading to local entitlements only', {
        error: getErrorMessage(error),
      });
      return {};
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

  async enforceEntitlements(requestData: RequestData, datasetSlugs: string[], capability: Capability): Promise<void> {
    if (this.isEntitlementsBypassed(requestData.token)) {
      // Internal requests and admins bypass entitlements checks
      return;
    }
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const results = await repo.find({
      select: { slug: true, visibility: true },
      where: { slug: In(datasetSlugs) },
    });
    const privateSlugs = results.filter(r => r.visibility === 'private').map(r => r.slug);
    if (privateSlugs.length === 0) {
      // All datasets are public, no need to enforce entitlements
      return;
    }
    for (const slug of privateSlugs) {
      if (!requestData.entitlements[slug] || !requestData.entitlements[slug]!.includes(capability)) {
        throw new ErrorResponse(`User does not have ${capability} entitlement for dataset ${slug}`, StatusCodes.FORBIDDEN);
      }
    }
  }
}
