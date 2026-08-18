import { assert } from 'console';
import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { EVERYONE } from '../constants/constants';
import { EntitlementsEntity } from '../entities/Entitlements';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import { type Entitlements } from '../types/Entitlements';
import { Capability } from '../types/enums';
import { ErrorResponse } from '../utils/error';
import { getEntitySlugs } from '../utils/slugs';
import DatasetEntity from '../entities/Dataset';

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
    return entitlements.reduce((acc, { data }) => {
      for (const key in data) {
        if (!acc[key]) {
          acc[key] = [];
        }
        const capabilities = data[key]!;
        acc[key] = Array.from(new Set([...acc[key], ...capabilities]));
      }
      return acc;
    }, externalEntitlements); // Using external entitlements as the accumulator base
  }

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
        throw new ErrorResponse(`Failed to fetch entitlements from endpoint: ${message}`, response.status);
      }
      return await response.json();
    } catch (error) {
      throw new ErrorResponse(`Failed to fetch entitlements from endpoint: ${error}`, StatusCodes.INTERNAL_SERVER_ERROR);
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
   * `token` is optional and caller-opt-in: passing it mirrors the bypass in
   * `enforceEntitlements`, so an admin/internal-request token always gets PREVIEW+DOWNLOAD
   * on a private dataset with no entitlements row (e.g. the admin who uploaded it — uploading
   * grants no entitlements row for the uploader) — matching what a direct call to the
   * download/preview endpoint would actually allow via `enforceEntitlements`.
   * DatasetService's admin `/datasets` routes deliberately omit it: those surface the *actual*
   * entitlement grants for dataset/entitlement management (see PUT /datasets/{id}/entitlements),
   * where an admin needs to see what other subjects are really entitled to, not a bypassed view.
   * FilterService's map/availability routes pass it: their `capabilities` field only drives the
   * frontend's own download affordance, so it should reflect what the caller can actually do.
   */
  getCapabilities = (visibility: 'public' | 'private', entitlements: Entitlements, slug: string, token?: Token): Capability[] => {
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
