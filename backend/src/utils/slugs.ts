import { EntityTarget, In } from 'typeorm';
import { StatusCodes } from 'http-status-codes';
import SlugHistoryEntity from '../entities/SlugHistory';
import { EntityType } from '../types/data';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from './error';

export const getEntity = async <T extends { id: string | number; slug: string }>(
  requestData: RequestData,
  entityClass: EntityTarget<T>,
  entityType: EntityType,
  slug: string,
  relations: string[] = [],
): Promise<T> => {
  const entityManager = requestData.entityManager;
  const entityRepo = entityManager.getRepository(entityClass);

  let entity = await entityRepo.findOne({ where: { slug } as any, relations });
  if (entity) {
    return entity;
  }

  const slugHistoryRepo = entityManager.getRepository(SlugHistoryEntity);
  const slugHistory = await slugHistoryRepo.findOne({
    where: {
      slug,
      entity_type: entityType,
    },
  });

  if (!slugHistory) {
    throw new ErrorResponse(`Resource '${slug}' not found`, StatusCodes.NOT_FOUND);
  }

  entity = await entityRepo.findOne({ where: { id: slugHistory.entity_id } as any, relations });
  if (!entity) {
    throw new ErrorResponse(`Resource '${slug}' not found`, StatusCodes.NOT_FOUND);
  }

  return entity;
};

export const getEntities = async <T extends { id: string | number; slug: string }>(
  requestData: RequestData,
  entityClass: EntityTarget<T>,
  entityType: EntityType,
  slugs: string[],
  relations: string[] = [],
): Promise<T[]> => {
  const entityManager = requestData.entityManager;
  const entityRepo = entityManager.getRepository(entityClass);
  const slugHistoryRepo = entityManager.getRepository(SlugHistoryEntity);

  const entities = await entityRepo.find({ where: { slug: In(slugs) } as any, relations });

  const entityBySlug = new Map<string, T>();
  const entityById = new Map<string | number, T>();

  for (const entity of entities) {
    entityBySlug.set(entity.slug, entity);
    entityById.set(entity.id, entity);
  }

  const foundSlugs = new Set(entityBySlug.keys());
  const missingSlugs = slugs.filter(slug => !foundSlugs.has(slug));

  if (missingSlugs.length === 0) {
    return slugs.map(slug => entityBySlug.get(slug)!);
  }

  const slugHistories = await slugHistoryRepo.find({
    where: {
      slug: In(missingSlugs),
      entity_type: entityType,
    },
  });

  if (slugHistories.length === 0) {
    throw new ErrorResponse(`Slugs ${missingSlugs.join(', ')} not found`, StatusCodes.NOT_FOUND);
  }

  const missingIds = slugHistories.map(sh => sh.entity_id).filter(id => !entityById.has(id));

  if (missingIds.length > 0) {
    const missingEntities = await entityRepo.find({ where: { id: In(missingIds) } as any, relations });

    for (const entity of missingEntities) {
      entityById.set(entity.id, entity);
      entityBySlug.set(entity.slug, entity);
    }
  }

  for (const sh of slugHistories) {
    const entity = entityById.get(sh.entity_id);
    if (!entity) {
      throw new ErrorResponse(`Resource '${sh.slug}' not found`, StatusCodes.NOT_FOUND);
    }
    entityBySlug.set(sh.slug, entity);
  }

  return slugs.map(slug => {
    const entity = entityBySlug.get(slug);
    if (!entity) {
      throw new ErrorResponse(`Resource '${slug}' not found`, StatusCodes.NOT_FOUND);
    }
    return entity;
  });
};

/**
 *
 * Replace a slug only if it is the latest segment of a path. Also works with query params.
 */
export const getNewPath = (originalUrl: string, oldSlug: string, newSlug: string): string => {
  const [path, queryString] = originalUrl.split('?');

  if (!path) return originalUrl;

  const pathSegments = path.split('/');

  if (pathSegments[pathSegments.length - 1] === oldSlug) {
    pathSegments[pathSegments.length - 1] = newSlug;
  }

  const newPath = pathSegments.join('/');

  return queryString ? `${newPath}?${queryString}` : newPath;
};

/**
 *
 * Replaces "id" value with "slug" value and removes "slug" key
 */
export const idToSlug = (input: any): any => {
  if (Array.isArray(input)) {
    return input.map(e => idToSlug(e));
  }
  if (input && typeof input['id'] === 'string' && typeof input['slug'] === 'string') {
    input['id'] = input['slug'];
    delete input['slug'];
  }
  return input;
};

/**
 *
 * Get all slugs related to the same entity
 */
export const getEntitySlugs = async (requestData: RequestData, slug: string): Promise<string[]> => {
  const entityManager = requestData.entityManager;
  const slugHistoryRepo = entityManager.getRepository(SlugHistoryEntity);
  const results = await slugHistoryRepo
    .createQueryBuilder('sh')
    .innerJoin(SlugHistoryEntity, 'match', 'match.entity_id = sh.entity_id')
    .where('match.slug = :slug', { slug })
    .getMany();
  return results.map(sh => sh.slug);
};
