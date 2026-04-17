import { RequestData } from '../interfaces/RequestData';
import VocabularyEntity from '../entities/Vocabulary';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from '../utils/error';
import { CreateVocabularyInput } from '../types/VocabularyInput';

export default class VocabularyService {
  getVocabulary = async (requestData: RequestData): Promise<VocabularyEntity[]> => {
    const repo = requestData.entityManager.getRepository(VocabularyEntity);
    return await repo.find();
  };

  getVocabularyItem = async (requestData: RequestData, slug: string): Promise<VocabularyEntity> => {
    return await getEntity(requestData, VocabularyEntity, EntityType.VOCABULARY, slug);
  };

  createVocabulary = async (requestData: RequestData, data: CreateVocabularyInput): Promise<VocabularyEntity> => {
    const repo = requestData.entityManager.getRepository(VocabularyEntity);

    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const vocabulary = repo.create(data);

    const saved = await repo.save(vocabulary);
    const reloaded = await repo.findOneBy({ id: saved.id });
    return reloaded!;
  };
}
