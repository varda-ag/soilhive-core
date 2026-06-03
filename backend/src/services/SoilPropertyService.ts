import { RequestData } from '../interfaces/RequestData';
import { SoilProperty } from '../interfaces/SoilProperty';
import SoilPropertyEntity from '../entities/SoilProperty';
import { getEntity, getEntities, idToSlug } from '../utils/slugs';
import { EntityType, UnitConversionType } from '../types/data';
import UnitConversionEntity from '../entities/UnitConversion';

export default class SoilPropertyService {
  getSoilProperties = async (requestData: RequestData): Promise<SoilPropertyEntity[]> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    return await repo.find({ relations: ['soil_property_category', 'unit_conversions'] });
  };

  getSoilProperty = async (requestData: RequestData, slug: string): Promise<SoilPropertyEntity> => {
    return await getEntity(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slug, ['soil_property_category', 'unit_conversions']);
  };

  async getSoilPropertiesBySlug(requestData: RequestData, slugs: string[]): Promise<SoilPropertyEntity[]> {
    return await getEntities(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, slugs, ['soil_property_category']);
  }

  /**
   *
   * @param requestData Mandatory request information
   * @param input Single soil property or array. Note: when using an array, all properties must be included in the input (i.e., no missing parent properties).
   * @param includeCategoricalConversions Boolean. Include 'CONDITIONAL' type unit conversions (pedotransfer functions). Note: Not supported yet, excluded by default.
   * @returns Replaces soil property IDs and category IDs with slugs and transforms SoilPropertyEntity into SoilProperty
   */
  idsToSlugs = async (
    requestData: RequestData,
    input: SoilPropertyEntity | SoilPropertyEntity[],
    includeCategoricalConversions: boolean = false,
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
      const tmp = this.categoryToSlug(input, includeCategoricalConversions);
      return idToSlug(tmp);
    }
    if (input.parent_property_id) {
      const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
      const parent = await repo.findOneByOrFail({ id: input.parent_property_id });
      input.parent_property_id = parent.slug;
    }
    const tmp = this.categoryToSlug(input, includeCategoricalConversions);
    return idToSlug(tmp);
  };

  categoryToSlug = (
    input: SoilPropertyEntity | SoilPropertyEntity[],
    includeCategoricalConversions: boolean,
  ): SoilProperty | SoilProperty[] => {
    if (Array.isArray(input)) {
      return input.map(e => this.categoryToSlug(e, includeCategoricalConversions)) as SoilProperty[];
    }
    const { soil_property_category, unit_conversions, ...rest } = input;
    rest.category_id = soil_property_category.slug;
    const original_units_of_measurement = {};
    let filtered_unit_conversions: UnitConversionEntity[] = unit_conversions;
    if (!includeCategoricalConversions) {
      filtered_unit_conversions = unit_conversions.filter(uc => uc.type !== UnitConversionType.CONDITIONAL);
    }
    for (const uc of filtered_unit_conversions) {
      original_units_of_measurement[uc.slug] = uc.original_unit_of_measurement;
    }
    return { ...rest, original_units_of_measurement };
  };
}
