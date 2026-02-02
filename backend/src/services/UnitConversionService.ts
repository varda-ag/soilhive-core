import { RequestData } from '../interfaces/RequestData';
import { UnitConversion } from '../interfaces/UnitConversion';
import UnitConversionEntity from '../entities/UnitConversion';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class UnitConversionService {
  getUnitConversions = async (requestData: RequestData): Promise<UnitConversion[]> => {
    const repo = requestData.entityManager.getRepository(UnitConversionEntity);
    return await repo.find();
  };

  getUnitConversion = async (requestData: RequestData, slug: string): Promise<UnitConversion> => {
    return await getEntity(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slug);
  };

  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]): Promise<UnitConversion[]> => {
    return await getEntities(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slugs);
  };
}
