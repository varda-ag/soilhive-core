import { RequestData } from '../interfaces/RequestData';
import LicenseEntity from '../entities/License';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { CreateLicenseInput } from '../types/LicenseInput';
import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';
import { ErrorResponse } from '../utils/error';
import { requireSub } from '../utils/auth';
import { CACHE_TTL_REFERENCE_MS } from '../utils/query-cache';
import { bumpCacheEpoch } from '../utils/cache-epoch';

export default class LicenseService {
  getLicenses = async (requestData: RequestData): Promise<LicenseEntity[]> => {
    const repo = requestData.entityManager.getRepository(LicenseEntity);
    return await repo.find({ cache: CACHE_TTL_REFERENCE_MS });
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
      await bumpCacheEpoch();
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
