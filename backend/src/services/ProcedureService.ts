import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import Procedure from '../entities/Procedure';

export default class ProcedureService {
  getProcedures = async (requestData: RequestData): Promise<Procedure[]> => {
    const repo = requestData.entityManager.getRepository(Procedure);
    return await repo.find();
  };

  getProcedure = async (requestData: RequestData, slug: string): Promise<Procedure> => {
    const repo = requestData.entityManager.getRepository(Procedure);
    const procedure = await repo.findOneBy({ slug });
    if (!procedure) {
      throw new ErrorResponse(`Procedure ${slug} not found`, StatusCodes.NOT_FOUND);
    }
    return procedure;
  };

  getProceduresBySlug = async (requestData: RequestData, slugs: string[]) => {
    const repo = requestData.entityManager.getRepository(Procedure);
    return await repo.findBy({ slug: In(slugs) });
  };
}
