import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { UnitConversion } from '../interfaces/UnitConversion';
import UnitConversionEntity from '../entities/UnitConversion';
import { getEntity, getEntities } from '../utils/slugs';
import { ErrorResponse } from '../utils/error';
import { EntityType } from '../types/data';
import SoilPropertyEntity from '../entities/SoilProperty';

export default class UnitConversionService {
  getUnitConversions = async (requestData: RequestData, soilPropertyId: string): Promise<UnitConversion[]> => {
    const { entityManager } = requestData;

    // the id coming in as parameter is the slug that allow us to load the soil_property with it's actual uuid
    const soilProperty = await getEntity(requestData, SoilPropertyEntity, EntityType.SOIL_PROPERTY, soilPropertyId);

    const repo = entityManager.getRepository(UnitConversionEntity);

    // Find all unit conversions for the soil property
    const unitConversions = await repo.find({
      where: {
        property_id: soilProperty.id,
      },
    });

    if (unitConversions.length === 0) {
      throw new ErrorResponse(`No unit conversions found for soil property '${soilPropertyId}'`, StatusCodes.NOT_FOUND);
    }

    return unitConversions;
  };

  getUnitConversion = async (requestData: RequestData, slug: string): Promise<UnitConversion> => {
    return await getEntity(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slug);
  };

  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]): Promise<UnitConversion[]> => {
    return await getEntities(requestData, UnitConversionEntity, EntityType.UNIT_CONVERSION, slugs);
  };
}
