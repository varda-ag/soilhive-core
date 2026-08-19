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

/** De-duplicated union, for two grants that land on the same slug after `normalizeToCurrentSlugs`. */
const mergeCapabilities = (existing: Capability[] | undefined, incoming: Capability[]): Capability[] =>
  Array.from(new Set([...(existing ?? []), ...incoming]));

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
    return this.normalizeToCurrentSlugs(requestData, merged);
  }

  /**
   * `entitlements` is keyed by slug, and some keys may be historical — a grant is written under
   * whatever slug is current at the time (see `setEntityEntitlements`) and is never rewritten on
   * a later rename. `getCapabilities`/`enforceEntitlements` look up by an entity's *current*
   * slug, so a stale key would make the grant silently stop applying. This re-keys the whole map
   * to current slugs, once, in one batched query — cost scales with grants held, not with
   * whatever listing a caller later checks them against.
   *
   * Not scoped to Dataset: any entity type can hold entitlements, and slug_history's rename
   * trigger already covers several (datasets, soil_properties, procedures, licenses, ...). "The
   * most recent slug_history row for this entity_id" is a safe definition of "current slug" here
   * because that trigger never reuses a slug value — a rename back to a prior name is
   * disambiguated (`name-1`) instead.
   *
   * A key matching no entity at all (e.g. `spatial_filter`) is left exactly as given.
   */
  private normalizeToCurrentSlugs = async (requestData: RequestData, entitlements: Entitlements): Promise<Entitlements> => {
    const slugs = Object.keys(entitlements);
    if (slugs.length === 0) {
      return entitlements;
    }

    const currentSlugByHistoricalSlug = await this.getCurrentSlugsFor(requestData, slugs);
    if (currentSlugByHistoricalSlug.size === 0) {
      return entitlements;
    }

    const normalized: Entitlements = {};
    for (const [slug, capabilities] of Object.entries(entitlements)) {
      const currentSlug = currentSlugByHistoricalSlug.get(slug) ?? slug; // unmatched (e.g. spatial_filter): keep as-is
      normalized[currentSlug] = mergeCapabilities(normalized[currentSlug], capabilities);
    }
    return normalized;
  };

  /** Maps each of `slugs` that matches a known entity to that entity's current slug. Omits any that don't. */
  private getCurrentSlugsFor = async (requestData: RequestData, slugs: string[]): Promise<Map<string, string>> => {
    const rows: { historical_slug: string; current_slug: string }[] = await requestData.entityManager.query(
      `SELECT sh.slug AS historical_slug, latest.slug AS current_slug
       FROM slug_history sh
       INNER JOIN (
         SELECT DISTINCT ON (entity_id) entity_id, slug
         FROM slug_history
         ORDER BY entity_id, created_at DESC
       ) latest ON latest.entity_id = sh.entity_id
       WHERE sh.slug = ANY($1::text[])`,
      [slugs],
    );
    return new Map(rows.map(({ historical_slug, current_slug }) => [historical_slug, current_slug]));
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
      log.warn('Failed to fetch entitlements from external endpoint, degrading to local entitlements only', {
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

  /**
   * Takes explicit arguments rather than an entity so
   * callers whose dataset shape carries the slug under a different field (e.g. the
   * Public Identifier `id` on FilterService's results) can call it directly.
   *
   * `token` mirrors the bypass in `enforceEntitlements`: an admin/internal-request token always
   * gets PREVIEW+DOWNLOAD on a private dataset with no entitlements row (e.g. the admin who
   * uploaded it — uploading grants no entitlements row for the uploader), matching what a direct
   * call to the download/preview endpoint would actually allow. Every caller of `getCapabilities`
   * passes it, so `capabilities` means the same thing everywhere it appears: what this caller can
   * actually do, not just what an entitlements row happens to say.
   */
  getCapabilities = (
    visibility: 'public' | 'private',
    entitlements: Entitlements,
    slug: string,
    token: Token | undefined,
  ): Capability[] => {
    if (visibility === 'public' || this.isEntitlementsBypassed(token)) {
      return [Capability.PREVIEW, Capability.DOWNLOAD];
    }
    return entitlements[slug] || [];
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
