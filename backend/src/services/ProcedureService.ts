import { RequestData } from '../interfaces/RequestData';
import ProcedureEntity from '../entities/Procedure';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class ProcedureService {
  getProcedures = async (requestData: RequestData): Promise<ProcedureEntity[]> => {
    const repo = requestData.entityManager.getRepository(ProcedureEntity);
    return await repo.find();
  };

  getProcedure = async (requestData: RequestData, slug: string): Promise<ProcedureEntity> => {
    return await getEntity(requestData, ProcedureEntity, EntityType.PROCEDURE, slug);
  };

  getProceduresBySlug = async (requestData: RequestData, slugs: string[]): Promise<ProcedureEntity[]> => {
    return await getEntities(requestData, ProcedureEntity, EntityType.PROCEDURE, slugs);
  };
}
