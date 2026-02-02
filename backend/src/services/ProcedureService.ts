import { RequestData } from '../interfaces/RequestData';
import { Procedure } from '../interfaces/Procedure';
import ProcedureEntity from '../entities/Procedure';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class ProcedureService {
  getProcedures = async (requestData: RequestData): Promise<Procedure[]> => {
    const repo = requestData.entityManager.getRepository(ProcedureEntity);
    return await repo.find();
  };

  getProcedure = async (requestData: RequestData, slug: string): Promise<Procedure> => {
    return await getEntity(requestData, ProcedureEntity, EntityType.PROCEDURE, slug);
  };

  getProceduresBySlug = async (requestData: RequestData, slugs: string[]): Promise<ProcedureEntity[]> => {
    return await Promise.all(slugs.map(slug => getEntity(requestData, ProcedureEntity, EntityType.PROCEDURE, slug)));
  };
}
