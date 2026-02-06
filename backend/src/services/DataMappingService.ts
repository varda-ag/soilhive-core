import { StatusCodes } from 'http-status-codes';
import { DataMapping, DataCleaningConfig } from '../interfaces/DataMapping';
import { PropertyMapping, PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import { RequestData } from '../interfaces/RequestData';
import type { DataMappingObject } from '../types/DataMapping';
import { ErrorResponse } from '../utils/error';
import DataMappingEntity from '../entities/DataMapping';
import UnitConversionEntity from '../entities/UnitConversion';
import SoilPropertyEntity from '../entities/SoilProperty';
import ProcedureEntity from '../entities/Procedure';
import { REQUIRED_METADATA_FIELDS } from '../constants/constants';
import UnitConversionService from './UnitConversionService';
import SoilPropertyService from './SoilPropertyService';
import ProcedureService from './ProcedureService';
import { sanitizeField } from '../utils/utils';

export default class DataMappingService {
  postDataMapping = async (requestData: RequestData, dataMapping: DataMappingObject): Promise<DataMapping> => {
    const { sub } = requestData.token;
    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    // Validate
    if (dataMapping.drop_records && !Array.isArray(dataMapping.drop_records)) {
      throw new ErrorResponse(`drop_records must be an array of numbers`, StatusCodes.BAD_REQUEST);
    }

    const repo = requestData.entityManager.getRepository(DataMappingEntity);

    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(DataMappingEntity)
      .values({
        data_mapping: dataMapping,
        created_by: sub,
      })
      .orUpdate(
        ['updated_at'], // on conflict update updated_at timestamp
        ['data_mapping_hash'], // the column with the UNIQUE constraint
      )
      .returning('*') // ensure we get the full record back (Postgres specific)
      .execute();

    return result.generatedMaps[0] as DataMapping;
  };

  parseDataMapping = async (requestData: RequestData, id: string): Promise<DataCleaningConfig> => {
    const result: DataCleaningConfig = {
      metadata_cols: {},
      property_cols: {},
    };
    const { data_mapping } = await this.getDataMapping(requestData, id);

    const conversionSlugs: string[] = Object.values(data_mapping)
      .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).conversion_id !== undefined)
      .map(mapping => (mapping as PropertyMapping).conversion_id!);

    const ucService = new UnitConversionService();
    const ucInfos = await ucService.getUnitConversionsBySlug(requestData, conversionSlugs);

    const ucInfoMap = ucInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, UnitConversionEntity>,
    );

    const propertySlugs: string[] = Object.values(data_mapping)
      .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).property_id !== undefined)
      .map(mapping => (mapping as PropertyMapping).property_id);

    const spService = new SoilPropertyService();
    const spInfos = await spService.getSoilPropertiesBySlug(requestData, propertySlugs);

    const spInfoMap = spInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, SoilPropertyEntity>,
    );

    const procedureSlugs: string[] = Object.values(data_mapping)
      .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).procedure_id !== undefined)
      .map(mapping => (mapping as PropertyMapping).procedure_id!);

    const pService = new ProcedureService();
    const pInfos = await pService.getProceduresBySlug(requestData, procedureSlugs);

    const pInfoMap = pInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, ProcedureEntity>,
    );

    // Process metadata (string types) and property columns (object types)
    for (const [field, mapping] of Object.entries(data_mapping)) {
      // TODO: update based on raw data load configuration (by default ogr2ogr converts to lowercase, option LAUNDER_ASCII=YES removes latin special characters, columns can be renamed with -sql option)
      const sanitizedField = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (sanitizedField === 'drop_records') continue;
      if (typeof mapping === 'string' || mapping instanceof String) {
        result.metadata_cols[sanitizeField(mapping as string)] = sanitizedField;
      } else if (typeof mapping === 'object') {
        const props = mapping as PropertyMapping;
        const propsProcessed: PropertyCleaningConfig = props;
        const spInfo = spInfoMap[props.property_id];
        const ucInfo = props.conversion_id ? (ucInfoMap[props.conversion_id] ?? null) : null;
        const pInfo = props.procedure_id ? (pInfoMap[props.procedure_id] ?? null) : null;
        propsProcessed.property_id = spInfo.id;
        propsProcessed.conversion_formula = ucInfo?.conversion_formula;
        propsProcessed.procedure_id = pInfo?.id;
        result.property_cols[sanitizedField] = propsProcessed;
      }
    }
    for (const requiredField of REQUIRED_METADATA_FIELDS) {
      if (!result.metadata_cols[requiredField]) {
        result.metadata_cols[requiredField] = null;
      }
    }
    if (data_mapping.drop_records && Array.isArray(data_mapping.drop_records)) {
      result.drop_records = data_mapping.drop_records;
    }
    return result;
  };

  getDataMapping = async (requestData: RequestData, id: string): Promise<DataMapping> => {
    const repo = requestData.entityManager.getRepository(DataMappingEntity);
    const dataMapping = await repo.findOneBy({ id });
    if (!dataMapping) {
      throw new ErrorResponse(`Data mapping ${id} not found`, StatusCodes.NOT_FOUND);
    }
    return dataMapping;
  };
}
