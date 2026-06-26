import { RequestData } from '../interfaces/RequestData';
import LicenseEntity from '../entities/License';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { CreateLicenseInput } from '../types/LicenseInput';
import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';
import { ErrorResponse } from '../utils/error';
import { requireSub } from '../utils/auth';

export default class LicenseService {
  getLicenses = async (requestData: RequestData): Promise<LicenseEntity[]> => {
    const repo = requestData.entityManager.getRepository(LicenseEntity);
    return await repo.find();
  };

  getLicense = async (requestData: RequestData, slug: string): Promise<LicenseEntity> => {
    return await getEntity(requestData, LicenseEntity, EntityType.LICENSE, slug);
  };

  createLicense = async (requestData: RequestData, data: CreateLicenseInput): Promise<LicenseEntity> => {
    requireSub(requestData);
    const repo = requestData.entityManager.getRepository(LicenseEntity);
    const license = repo.create(data);

    try {
      const saved = await repo.save(license);
      const reloaded = await repo.findOneBy({ id: saved.id });
      return reloaded!;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`License with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };
}
