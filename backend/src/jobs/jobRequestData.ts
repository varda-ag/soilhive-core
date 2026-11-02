import { EntityManager } from 'typeorm';
import { CommonJobData } from '../interfaces/Job';
import { RequestData } from '../interfaces/RequestData';
import { Token } from '../interfaces/Token';
import EntitlementService from '../services/EntitlementService';
import { EVERYONE } from '../constants/constants';

/**
 * The submitter as a job processor acts for them: their Subject and admin flags from the job data,
 * and their local grants only, since a job has no raw token to reach the external endpoint with.
 */
export const jobRequestData = async (entityManager: EntityManager, data: CommonJobData): Promise<RequestData> => {
  const token = { sub: data.created_by ?? undefined, isDataAdmin: data.isDataAdmin, isSuperAdmin: data.isSuperAdmin } as Token;
  const entitlements = await new EntitlementService().getUserEntitlements({ entityManager } as RequestData, data.created_by ?? EVERYONE);
  return { entityManager, token, entitlements };
};
