import { describe, it, expect } from '@jest/globals';
import ProcedureService from '../../src/services/ProcedureService';
import { getEntityManager } from '../../src/utils/data-source';
import { addVocabulary } from '../../src/utils/mock';
import { Token } from '../../src/interfaces/Token';
import { RequestData } from '../../src/interfaces/RequestData';
import { VocabularyType, ProcedureTechnique } from '../../src/types/data';
import { StatusCodes } from 'http-status-codes';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: () => false,
  isDataAdmin: () => false,
};

const getRequestData = async (token: Token | undefined = mockToken): Promise<RequestData> => ({
  entityManager: await getEntityManager(),
  token,
});

const SAMPLE_PRETREATMENT = 'air dry';
const LABORATORY_METHOD = 'Mehlich 3';

describe('ProcedureService', () => {
  const service = new ProcedureService();

  describe('getProcedures', () => {
    it('returns empty array when no procedures exist', async () => {
      const requestData = await getRequestData();
      const result = await service.getProcedures(requestData);
      expect(result).toEqual([]);
    });

    it('returns procedures with vocabulary names', async () => {
      await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
      await addVocabulary(LABORATORY_METHOD, VocabularyType.LABORATORY_METHOD);
      const requestData = await getRequestData();
      try {
        await service.createProcedure(requestData, {
          sample_pretreatment: SAMPLE_PRETREATMENT,
          technique: ProcedureTechnique.LAB_PROCEDURE,
          laboratory_method: LABORATORY_METHOD,
        });
      } catch (e) {
        console.error(e);
        throw e;
      }

      const result = await service.getProcedures(requestData);
      expect(result.length).toBe(1);
      expect(result[0].sample_pretreatment).toBe(SAMPLE_PRETREATMENT);
      expect(result[0].technique).toBe(ProcedureTechnique.LAB_PROCEDURE);
      expect(result[0].laboratory_method).toBe(LABORATORY_METHOD);
    });
  });

  describe('getProcedure', () => {
    it('returns the correct procedure by slug', async () => {
      await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
      const requestData = await getRequestData();
      const created = await service.createProcedure(requestData, {
        sample_pretreatment: SAMPLE_PRETREATMENT,
        technique: ProcedureTechnique.SPECTRAL,
      });

      const result = await service.getProcedure(requestData, created.id);
      expect(result.id).toBe(created.id);
      expect(result.sample_pretreatment).toBe(SAMPLE_PRETREATMENT);
      expect(result.technique).toBe(ProcedureTechnique.SPECTRAL);
    });

    it('throws 404 for an unknown slug', async () => {
      const requestData = await getRequestData();
      await expect(service.getProcedure(requestData, 'non-existent')).rejects.toMatchObject({
        status: StatusCodes.NOT_FOUND,
      });
    });
  });

  describe('createProcedure', () => {
    it('creates a procedure with all provided fields', async () => {
      await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
      await addVocabulary(LABORATORY_METHOD, VocabularyType.LABORATORY_METHOD);
      const requestData = await getRequestData();

      const result = await service.createProcedure(requestData, {
        sample_pretreatment: SAMPLE_PRETREATMENT,
        technique: ProcedureTechnique.LAB_PROCEDURE,
        laboratory_method: LABORATORY_METHOD,
      });

      expect(typeof result.id).toBe('string');
      expect(result.sample_pretreatment).toBe(SAMPLE_PRETREATMENT);
      expect(result.technique).toBe(ProcedureTechnique.LAB_PROCEDURE);
      expect(result.laboratory_method).toBe(LABORATORY_METHOD);
    });

    it('creates a procedure with only some fields set', async () => {
      await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
      const requestData = await getRequestData();

      const result = await service.createProcedure(requestData, {
        sample_pretreatment: SAMPLE_PRETREATMENT,
      });

      expect(typeof result.id).toBe('string');
      expect(result.sample_pretreatment).toBe(SAMPLE_PRETREATMENT);
      expect(result.technique).toBeUndefined();
      expect(result.laboratory_method).toBeUndefined();
    });

    it('returns the same id when the same combination is created twice', async () => {
      await addVocabulary(SAMPLE_PRETREATMENT, VocabularyType.SAMPLE_PRETREATMENT);
      const requestData = await getRequestData();
      const input = { sample_pretreatment: SAMPLE_PRETREATMENT };

      const first = await service.createProcedure(requestData, input);
      const second = await service.createProcedure(requestData, input);

      expect(first.id).toBe(second.id);
    });

    it('throws 400 when a vocabulary name does not exist', async () => {
      const requestData = await getRequestData();
      await expect(
        service.createProcedure(requestData, { sample_pretreatment: 'non-existent' }),
      ).rejects.toMatchObject({ status: StatusCodes.BAD_REQUEST });
    });
  });
});
