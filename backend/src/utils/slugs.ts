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
): Promise<T> => {
  const entityManager = requestData.entityManager;
  const entityRepo = entityManager.getRepository(entityClass);

  let entity = await entityRepo.findOne({
    where: { slug } as any,
  });

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
    throw new ErrorResponse(`Entity with slug '${slug}' not found in table "${entityType}"`, StatusCodes.NOT_FOUND);
  }

  entity = await entityRepo.findOne({
    where: { id: slugHistory.entity_id } as any,
  });

  if (!entity) {
    throw new ErrorResponse(`Entity with slug '${slug}' not found in table "${entityType}"`, StatusCodes.NOT_FOUND);
  }

  return entity;
};

export const getEntities = async <T extends { id: string | number; slug: string }>(
  requestData: RequestData,
  entityClass: EntityTarget<T>,
  entityType: EntityType,
  slugs: string[],
): Promise<T[]> => {
  const entityManager = requestData.entityManager;
  const entityRepo = entityManager.getRepository(entityClass);
  const slugHistoryRepo = entityManager.getRepository(SlugHistoryEntity);

  const entities = await entityRepo.find({ where: { slug: In(slugs) } as any });

  const foundSlugs = new Set(entities.map(sp => sp.slug));
  const missingSlugs = slugs.filter(slug => !foundSlugs.has(slug));

  if (missingSlugs.length === 0) {
    return slugs.map(slug => entities.find(sp => sp.slug === slug)!);
  }

  const slugHistories = await slugHistoryRepo.find({
    where: { slug: In(missingSlugs), entity_type: entityType },
  });

  if (slugHistories.length === 0) {
    throw new ErrorResponse(`Some slugs not found`, StatusCodes.NOT_FOUND);
  }

  const missingIds = slugHistories.map(sh => sh.entity_id);

  const missingEntities = await entityRepo.find({ where: { id: In(missingIds) } as any });
  const allEntities = [...entities, ...missingEntities];
  const entityBySlug = new Map(allEntities.map(e => [e.slug, e]));

  return slugs.map(slug => {
    const entity = entityBySlug.get(slug);
    if (!entity) {
      throw new ErrorResponse(
        `Entity with slug '${slug}' not found in table "${entityType}"`,
        StatusCodes.NOT_FOUND,
      );
    }
    return entity;
  });
};
