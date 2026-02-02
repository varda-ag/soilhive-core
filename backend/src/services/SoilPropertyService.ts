import { RequestData } from '../interfaces/RequestData';
import { SoilProperty } from '../interfaces/SoilProperty';
import SoilPropertyEntity from '../entities/SoilProperty';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class SoilPropertyService {
  getSoilProperties = async (requestData: RequestData): Promise<SoilProperty[]> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    return await repo.find();
  };

  getSoilProperty = async (requestData: RequestData, slug: string): Promise<SoilProperty> => {
    return await getEntity(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slug);
  };

  getSoilPropertiesBySlug = async (requestData: RequestData, slugs: string[]): Promise<SoilProperty[]> => {
    return await getEntities(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slugs);
  };
}
