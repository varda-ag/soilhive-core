import { RequestData } from '../interfaces/RequestData';
import { StatusCodes } from 'http-status-codes';
import ProcedureEntity from '../entities/Procedure';
import VocabularyEntity from '../entities/Vocabulary';
import { getEntity, getEntities } from '../utils/slugs';
import { EntityType, ProcedureTechnique, VocabularyType } from '../types/data';
import { ProcedureObject } from '../types/Procedure';
import { ErrorResponse } from '../utils/error';

const PROCEDURE_RELATIONS = [
  'sample_pretreatment',
  'laboratory_method',
  'extractant_concentration',
  'extraction_ratio',
  'extraction_base',
  'measurement_procedure',
  'limit_of_detection',
];

const toProcedureObject = (procedure: ProcedureEntity): ProcedureObject => ({
  id: procedure.slug,
  ...(procedure.technique !== undefined && { technique: procedure.technique }),
  ...(procedure.sample_pretreatment && { sample_pretreatment: procedure.sample_pretreatment.name }),
  ...(procedure.laboratory_method && { laboratory_method: procedure.laboratory_method.name }),
  ...(procedure.extractant_concentration && { extractant_concentration: procedure.extractant_concentration.name }),
  ...(procedure.extraction_ratio && { extraction_ratio: procedure.extraction_ratio.name }),
  ...(procedure.extraction_base && { extraction_base: procedure.extraction_base.name }),
  ...(procedure.measurement_procedure && { measurement_procedure: procedure.measurement_procedure.name }),
  ...(procedure.limit_of_detection && { limit_of_detection: procedure.limit_of_detection.name }),
});

export default class ProcedureService {
  getProcedures = async (requestData: RequestData): Promise<ProcedureObject[]> => {
    const repo = requestData.entityManager.getRepository(ProcedureEntity);
    const data = await repo.find({ relations: PROCEDURE_RELATIONS });
    return data.map(toProcedureObject);
  };

  getProcedure = async (requestData: RequestData, slug: string): Promise<ProcedureObject> => {
    const procedure = await getEntity(requestData, ProcedureEntity, EntityType.PROCEDURE, slug, PROCEDURE_RELATIONS);
    return toProcedureObject(procedure);
  };

  getProceduresBySlug = async (requestData: RequestData, slugs: string[]): Promise<ProcedureEntity[]> => {
    return await getEntities(requestData, ProcedureEntity, EntityType.PROCEDURE, slugs);
  };

  createProcedure = async (requestData: RequestData, data: Omit<ProcedureObject, 'id'>): Promise<ProcedureObject> => {
    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const vocabRepo = requestData.entityManager.getRepository(VocabularyEntity);

    const lookupVocab = async (name: string | undefined, category: VocabularyType): Promise<string | undefined> => {
      if (!name) return undefined;
      const vocab = await vocabRepo.findOne({ where: { name, category } });
      if (!vocab) throw new ErrorResponse(`Vocabulary '${name}' not found in category '${category}'`, StatusCodes.BAD_REQUEST);
      return vocab.id;
    };

    const [
      sample_pretreatment_id,
      laboratory_method_id,
      extractant_concentration_id,
      extraction_ratio_id,
      extraction_base_id,
      measurement_procedure_id,
      limit_of_detection_id,
    ] = await Promise.all([
      lookupVocab(data.sample_pretreatment, VocabularyType.SAMPLE_PRETREATMENT),
      lookupVocab(data.laboratory_method, VocabularyType.LABORATORY_METHOD),
      lookupVocab(data.extractant_concentration, VocabularyType.EXTRACTANT_CONCENTRATION),
      lookupVocab(data.extraction_ratio, VocabularyType.EXTRACTION_RATIO),
      lookupVocab(data.extraction_base, VocabularyType.EXTRACTION_BASE),
      lookupVocab(data.measurement_procedure, VocabularyType.MEASUREMENT_PROCEDURE),
      lookupVocab(data.limit_of_detection, VocabularyType.LIMIT_OF_DETECTION),
    ]);

    const repo = requestData.entityManager.getRepository(ProcedureEntity);

    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(ProcedureEntity)
      .values({
        ...(data.technique !== undefined && { technique: data.technique as ProcedureTechnique }),
        ...(sample_pretreatment_id !== undefined && { sample_pretreatment_id }),
        ...(laboratory_method_id !== undefined && { laboratory_method_id }),
        ...(extractant_concentration_id !== undefined && { extractant_concentration_id }),
        ...(extraction_ratio_id !== undefined && { extraction_ratio_id }),
        ...(extraction_base_id !== undefined && { extraction_base_id }),
        ...(measurement_procedure_id !== undefined && { measurement_procedure_id }),
        ...(limit_of_detection_id !== undefined && { limit_of_detection_id }),
      })
      .orUpdate(
        ['updated_at'],
        [
          'sample_pretreatment_id',
          'technique',
          'laboratory_method_id',
          'extractant_concentration_id',
          'extraction_ratio_id',
          'extraction_base_id',
          'measurement_procedure_id',
          'limit_of_detection_id',
        ],
      )
      .returning('slug')
      .execute();

    const newProcedure = await getEntity(requestData, ProcedureEntity, EntityType.PROCEDURE, result.raw[0].slug, PROCEDURE_RELATIONS);
    return toProcedureObject(newProcedure);
  };
}
