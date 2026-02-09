import { RequestData } from '../interfaces/RequestData';
import { SoilProperty } from '../interfaces/SoilProperty';
import SoilPropertyEntity from '../entities/SoilProperty';
import { getEntity, getEntities, idToSlug } from '../utils/slugs';
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

  propertiesIdToSlugs = async (requestData: RequestData, input: SoilProperty | SoilProperty[]): Promise<SoilProperty | SoilProperty[]> => {
    if (Array.isArray(input)) {
      const idMap = input.reduce(
        (acc, item) => {
          acc[item.id] = item;
          return acc;
        },
        {} as Map<string, SoilPropertyEntity>,
      );
      for (const item of input) {
        if (item.parent_property_id) {
          // Replacing the parent_property_id with the corresponding slug
          item.parent_property_id = idMap[item.parent_property_id].slug;
        }
      }
      return idToSlug(input);
    }
    if (!input.parent_property_id) {
      return idToSlug(input);
    }
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    const parent = await repo.findOneByOrFail({ id: input.parent_property_id });
    input.parent_property_id = parent.slug;
    return idToSlug(input);
  };
}
