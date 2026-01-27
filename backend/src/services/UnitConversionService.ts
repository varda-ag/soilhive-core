import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { UnitConversion } from '../interfaces/UnitConversion';
import UnitConversionEntity from '../entities/UnitConversion';

export default class UnitConversionService {
  getUnitConversions = async (requestData: RequestData): Promise<UnitConversion[]> => {
    const repo = requestData.entityManager.getRepository(UnitConversionEntity);
    return await repo.find();
  };

  getUnitConversion = async (requestData: RequestData, slug: string): Promise<UnitConversion> => {
    const repo = requestData.entityManager.getRepository(UnitConversionEntity);
    const unitConversion = await repo.findOneBy({ slug });
    if (!unitConversion) {
      throw new ErrorResponse(`Unit conversion ${slug} not found`, StatusCodes.NOT_FOUND);
    }
    return unitConversion;
  };

  getUnitConversionsBySlug = async (requestData: RequestData, slugs: string[]) => {
    const repo = requestData.entityManager.getRepository(UnitConversionEntity);
    return await repo.findBy({ slug: In(slugs) });
  };
}
