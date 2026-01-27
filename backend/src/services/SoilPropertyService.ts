import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { SoilProperty } from '../interfaces/SoilProperty';
import SoilPropertyEntity from '../entities/SoilProperty';

export default class SoilPropertyService {
  getSoilProperties = async (requestData: RequestData): Promise<SoilProperty[]> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    return await repo.find();
  };

  getSoilProperty = async (requestData: RequestData, slug: string): Promise<SoilProperty> => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    const soilProperty = await repo.findOneBy({ slug });
    if (!soilProperty) {
      throw new ErrorResponse(`Soil property ${slug} not found`, StatusCodes.NOT_FOUND);
    }
    return soilProperty;
  };

  getSoilPropertiesBySlug = async (requestData: RequestData, slugs: string[]) => {
    const repo = requestData.entityManager.getRepository(SoilPropertyEntity);
    return await repo.findBy({ slug: In(slugs) });
  };
}
