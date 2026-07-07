import { RequestData } from '../interfaces/RequestData';
import SoilPropertyCategoryEntity from '../entities/SoilPropertyCategory';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { CACHE_TTL_REFERENCE_MS } from '../utils/query-cache';

export default class SoilPropertyCategoryService {
  getSoilPropertyCategories = async (requestData: RequestData): Promise<SoilPropertyCategoryEntity[]> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyCategoryEntity);
    return await repo.find({ cache: CACHE_TTL_REFERENCE_MS });
  };

  getSoilPropertyCategory = async (requestData: RequestData, slug: string): Promise<SoilPropertyCategoryEntity> => {
    return await getEntity(requestData, SoilPropertyCategoryEntity, EntityType.SOIL_PROPERTY_CATEGORY, slug);
  };
}
