import { RequestData } from '../interfaces/RequestData';
import { EntitlementsEntity } from '../entities/Entitlements';
import { getEntitySlugs } from '../utils/slugs';
import { Capability, EVERYONE, type Entitlements } from '../types/Entitlements';
import { assert } from 'console';
import { In } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from '../utils/error';

export default class EntitlementService {
  getEntityEntitlements = async (requestData: RequestData, slug: string): Promise<Entitlements> => {
    // 1. Get all slugs related to the same entity (this handles slug history)
    const slugs = await getEntitySlugs(requestData, slug);
    if (slugs.length === 0) {
      // This handles entitlements for "non-entities" (e.g.: "spatial_filter")
      // that do not have a slug in the system
      slugs.push(slug);
    }
    // 2. Get all entitlements that match any of the slugs
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entitlements = await repo.createQueryBuilder('ent').where('ent.data ?| array[:...slugs]', { slugs }).getMany();
    return entitlements.reduce((acc, { id, data }) => {
      const key = slugs.find(k => k in data);
      assert(key, 'Key should be found in data');
      acc[id] = data[key!]!;
      return acc;
    }, {} as Entitlements);
  };

  setEntityEntitlements = async (requestData: RequestData, slug: string, entitlements: Entitlements): Promise<void> => {
    // 1. Remove all entitlements
    await this.deleteEntityEntitlements(requestData, slug);
    // 2. Group user IDs
    const ids = Object.keys(entitlements);
    if (ids.length === 0) {
      // Nothing to do
      return;
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
  };

  deleteEntityEntitlements = async (requestData: RequestData, slug: string): Promise<void> => {
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    await repo
      .createQueryBuilder('ent')
      .update(EntitlementsEntity)
      .set({
        data: () => 'data - :slug',
      })
      .setParameter('slug', slug)
      .execute();
  };

  async getUserEntitlements(requestData: RequestData, id?: string): Promise<Entitlements> {
    const externalEntitlements = await this.callEntitlementsEndpoint(requestData);
    // Local DB entitlements may override external entitlements
    const repo = requestData.entityManager.getRepository(EntitlementsEntity);
    const entitlements = await repo.find({ where: { id: In([id, EVERYONE]) } });
    return entitlements.reduce((acc, { data }) => {
      for (const key in data) {
        if (!acc[key]) {
          acc[key] = [];
        }
        const capabilities = data[key]!;
        acc[key] = Array.from(new Set([...acc[key], ...capabilities]));
      }
      return acc;
    }, externalEntitlements);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enforceEntitlements = (requestData: RequestData, datasetSlugs: string[], capability: Capability): void => {
    // TODO: implement
  };
}
