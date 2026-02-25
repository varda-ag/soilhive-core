import { RequestData } from '../interfaces/RequestData';
import LicenseEntity from '../entities/License';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class LicenseService {
  getLicenses = async (requestData: RequestData): Promise<LicenseEntity[]> => {
    const repo = requestData.entityManager.getRepository(LicenseEntity);
    return await repo.find();
  };

  getLicense = async (requestData: RequestData, slug: string): Promise<LicenseEntity> => {
    return await getEntity(requestData, LicenseEntity, EntityType.LICENSE, slug);
  };
}
