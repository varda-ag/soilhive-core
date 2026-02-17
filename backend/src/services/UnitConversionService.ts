import { RequestData } from '../interfaces/RequestData';
import { UnitConversion } from '../interfaces/UnitConversion';
import UnitConversionEntity from '../entities/UnitConversion';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType } from '../types/data';
import SoilPropertyEntity from '../entities/SoilProperty';

export default class UnitConversionService {
  getUnitConversions = async (requestData: RequestData, soilPropertySlug?: string): Promise<UnitConversion[]> => {
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
    });

    return unitConversions;
  };

  getUnitConversion = async (requestData: RequestData, slug: string): Promise<UnitConversion> => {
    return await getEntity(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slug);
  };

  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]): Promise<UnitConversion[]> => {
    return await getEntities(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slugs);
  };
}
