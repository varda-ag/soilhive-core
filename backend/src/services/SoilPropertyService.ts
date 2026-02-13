import { RequestData } from '../interfaces/RequestData';
import { SoilProperty } from '../interfaces/SoilProperty';
import SoilPropertyEntity from '../entities/SoilProperty';
import { getEntity, getEntities, idToSlug } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class SoilPropertyService {
  getSoilProperties = async (requestData: RequestData): Promise<SoilPropertyEntity[]> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    const data = await repo.find({ relations: ['soil_property_category'] });
    return data;
  };

  getSoilProperty = async (requestData: RequestData, slug: string): Promise<SoilPropertyEntity> => {
    return await getEntity(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slug, ['soil_property_category']);
  };

  getSoilPropertiesBySlug = async (requestData: RequestData, slugs: string[]): Promise<SoilPropertyEntity[]> => {
    return await getEntities(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slugs, ['soil_property_category']);
  };

  /**
   *
   * @param requestData Mandatory request information
   * @param input Single soil property or array. Note: when using an array, all properties must be included in the input (i.e., no missing parent properties).
   * @returns Replaces soil property IDs and category IDs with slugs and transforms SoilPropertyEntity into SoilProperty
   */
  idsToSlugs = async (
    requestData: RequestData,
    input: SoilPropertyEntity | SoilPropertyEntity[],
  ): Promise<SoilProperty | SoilProperty[]> => {
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
      const tmp = this.categoryToSlug(input);
      return idToSlug(tmp);
    }
    if (input.parent_property_id) {
      const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
      const parent = await repo.findOneByOrFail({ id: input.parent_property_id });
      input.parent_property_id = parent.slug;
    }
    const tmp = this.categoryToSlug(input);
    return idToSlug(tmp);
  };

  categoryToSlug = (input: SoilPropertyEntity | SoilPropertyEntity[]): SoilProperty | SoilProperty[] => {
    if (Array.isArray(input)) {
      return input.map(e => this.categoryToSlug(e)) as SoilProperty[];
    }
    const { soil_property_category, ...rest } = input;
    rest.category_id = soil_property_category.slug;
    return rest;
  };
}
