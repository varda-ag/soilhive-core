import { RequestData } from '../interfaces/RequestData';
import VocabularyEntity from '../entities/Vocabulary';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';
import { requireSub } from '../utils/auth';
import { CreateVocabularyInput } from '../types/VocabularyInput';
import { CACHE_TTL_REFERENCE_MS } from '../utils/query-cache';
import { bumpCacheEpoch } from '../utils/cache-epoch';

export default class VocabularyService {
  getVocabulary = async (requestData: RequestData): Promise<VocabularyEntity[]> => {
    const repo = requestData.entityManager.getRepository(VocabularyEntity);
    return await repo.find({ cache: CACHE_TTL_REFERENCE_MS });
  };

  getVocabularyItem = async (requestData: RequestData, slug: string): Promise<VocabularyEntity> => {
    return await getEntity(requestData, VocabularyEntity, EntityType.VOCABULARY, slug);
  };

  createVocabulary = async (requestData: RequestData, data: CreateVocabularyInput): Promise<VocabularyEntity> => {
    requireSub(requestData);
    const repo = requestData.entityManager.getRepository(VocabularyEntity);
    const vocabulary = repo.create(data);

    const saved = await repo.save(vocabulary);
    await bumpCacheEpoch();
    const reloaded = await repo.findOneBy({ id: saved.id });
    return reloaded!;
  };
}
