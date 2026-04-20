import { describe, it, expect } from '@jest/globals';
import VocabularyService from '../../src/services/VocabularyService';
import { getEntityManager } from '../../src/utils/data-source';
import { addVocabulary } from '../../src/utils/mock';
import { Token } from '../../src/interfaces/Token';
import { RequestData } from '../../src/interfaces/RequestData';
import { VocabularyType } from '../../src/types/data';
import { StatusCodes } from 'http-status-codes';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

const getRequestData = async (token: Token | undefined): Promise<RequestData> => ({
  entityManager: await getEntityManager(),
  token,
  entitlements: {},
});

describe('VocabularyService', () => {
  const service = new VocabularyService();

  describe('getVocabulary', () => {
    it('returns empty array when no items exist', async () => {
      const requestData = await getRequestData(mockToken);
      const result = await service.getVocabulary(requestData);
      expect(result).toEqual([]);
    });

    it('returns all vocabulary items', async () => {
      await addVocabulary('air dry', VocabularyType.SAMPLE_PRETREATMENT);
      await addVocabulary('ICP-OES', VocabularyType.LABORATORY_METHOD);
      const requestData = await getRequestData(mockToken);

      const result = await service.getVocabulary(requestData);
      expect(result.length).toBe(2);
    });
  });

  describe('getVocabularyItem', () => {
    it('returns the correct item by slug', async () => {
      const vocab = await addVocabulary('air dry', VocabularyType.SAMPLE_PRETREATMENT);
      const requestData = await getRequestData(mockToken);

      const result = await service.getVocabularyItem(requestData, vocab.slug);
      expect(result.name).toBe('air dry');
      expect(result.category).toBe(VocabularyType.SAMPLE_PRETREATMENT);
    });

    it('throws 404 for an unknown slug', async () => {
      const requestData = await getRequestData(mockToken);
      await expect(service.getVocabularyItem(requestData, 'non-existent')).rejects.toMatchObject({
        status: StatusCodes.NOT_FOUND,
      });
    });
  });

  describe('createVocabulary', () => {
    it('creates and returns a vocabulary item', async () => {
      const requestData = await getRequestData(mockToken);
      const result = await service.createVocabulary(requestData, {
        name: 'air dry',
        category: VocabularyType.SAMPLE_PRETREATMENT,
      });

      expect(result.name).toBe('air dry');
      expect(result.category).toBe(VocabularyType.SAMPLE_PRETREATMENT);
      expect(typeof result.slug).toBe('string');
    });

    it('throws 401 when no token is provided', async () => {
      const requestData = await getRequestData(undefined);
      await expect(
        service.createVocabulary(requestData, { name: 'air dry', category: VocabularyType.SAMPLE_PRETREATMENT }),
      ).rejects.toMatchObject({ status: StatusCodes.UNAUTHORIZED });
    });
  });
});
