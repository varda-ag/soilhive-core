import { EntityTarget } from 'typeorm';
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
