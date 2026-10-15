import { RequestData } from '../interfaces/RequestData';
import UnitConversionEntity from '../entities/UnitConversion';
import { getEntities } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class UnitConversionService {
  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]): Promise<UnitConversionEntity[]> => {
    return await getEntities(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slugs, ['soil_property']);
  };
}
