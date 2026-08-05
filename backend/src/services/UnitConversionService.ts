import { In } from 'typeorm';
import { RequestData } from '../interfaces/RequestData';
import UnitConversionEntity from '../entities/UnitConversion';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType, UnitConversionType } from '../types/data';
import SoilPropertyEntity from '../entities/SoilProperty';

export default class UnitConversionService {
  getUnitConversions = async (requestData: RequestData, soilPropertySlug?: string): Promise<UnitConversionEntity[]> => {
    const { entityManager } = requestData;

    const whereConditions: any = {};

    if (soilPropertySlug !== undefined) {
      const soilProperty = await getEntity(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, soilPropertySlug);
      whereConditions.property_id = soilProperty.id;
    }

    const repo = entityManager.getRepository(UnitConversionEntity);

    // Find all unit conversions for the soil property
    const unitConversions = await repo.find({
      where: whereConditions,
      relations: ['soil_property'],
    });

    return unitConversions;
  };

  getUnitConversion = async (requestData: RequestData, slug: string): Promise<UnitConversionEntity> => {
    return await getEntity(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slug, ['soil_property']);
  };

  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]): Promise<UnitConversionEntity[]> => {
    return await getEntities(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slugs, ['soil_property']);
  };

  /**
   * Of the given soil properties, those whose values are class codes rather than measurements —
   * identified by having a CATEGORY_MAPPING conversion.
   *
   * Asked of the property rather than of the one conversion a caller happens to hold, because
   * naming a conversion is optional (`RasterBandMapping.conversion_id` is nullable): a band mapped
   * without one would otherwise look continuous and have its classes averaged.
   */
  getCategoricalPropertyIds = async (requestData: RequestData, propertyIds: string[]): Promise<Set<string>> => {
    if (propertyIds.length === 0) return new Set();
    const conversions = await requestData.entityManager.getRepository(UnitConversionEntity).find({
      where: { property_id: In(propertyIds), type: UnitConversionType.CATEGORY_MAPPING },
      select: ['property_id'],
    });
    return new Set(conversions.map(({ property_id }) => property_id));
  };
}
