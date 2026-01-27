import { StatusCodes } from 'http-status-codes';
import { DataMapping, DataCleaningConfig } from '../interfaces/DataMapping';
import { PropertyMapping, PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import { RequestData } from '../interfaces/RequestData';
import type { DataMappingObject } from '../types/DataMapping';
import { ErrorResponse } from '../utils/error';
import DataMappingEntity from '../entities/DataMapping';
import UnitConversionEntity from '../entities/UnitConversion';
import FileEntity from '../entities/File';
import { REQUIRED_METADATA_FIELDS } from '../constants/constants';
import UnitConversionService from './UnitConversionService';
import SoilPropertyService from './SoilPropertyService';
import SoilPropertyEntity from '../entities/SoilProperty';
import ProcedureService from './ProcedureService';
import ProcedureEntity from '../entities/Procedure';

export default class DataMappingService {
  postDataMapping = async (requestData: RequestData, dataMapping: DataMappingObject): Promise<DataMapping> => {
    // Validate
    if (dataMapping.drop_records && !Array.isArray(dataMapping.drop_records)) {
      throw new ErrorResponse(`drop_records must be an array of numbers`, StatusCodes.BAD_REQUEST);
    }

    const repo = requestData.entityManager.getRepository(DataMappingEntity);
    const newRow = new DataMappingEntity();
    newRow.data_mapping = dataMapping;
    await repo.save(newRow);

    return newRow;
  };

  parseDataMapping = async (requestData: RequestData, id: string, fileId: string): Promise<DataCleaningConfig> => {
    const file_repo = requestData.entityManager.getRepository(FileEntity);
    await file_repo.findOneByOrFail({ id: fileId });
    const result: DataCleaningConfig = {
      metadata_cols: {},
      property_cols: {},
      file_id: fileId,
    };
    const dataMapping = await this.getDataMapping(requestData, id);

    const conversionSlugs: string[] = Object.values(dataMapping)
      .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).conversion_slug !== undefined)
      .map(mapping => (mapping as PropertyMapping).conversion_slug!);

    const ucService = new UnitConversionService();
    const ucInfos = await ucService.getUnitConversionsBySlug(requestData, conversionSlugs);

    const ucInfoMap = ucInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, UnitConversionEntity>,
    );

    const propertySlugs: string[] = Object.values(dataMapping)
      .filter(mapping => typeof mapping === 'object')
      .map(mapping => (mapping as PropertyMapping).property_slug);

    const spService = new SoilPropertyService();
    const spInfos = await spService.getSoilPropertiesBySlug(requestData, propertySlugs);

    const spInfoMap = spInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, SoilPropertyEntity>,
    );

    const procedureSlugs: string[] = Object.values(dataMapping)
      .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).procedure_slug !== undefined)
      .map(mapping => (mapping as PropertyMapping).procedure_slug!);

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
    for (const [field, mapping] of Object.entries(dataMapping)) {
      // TODO: update based on raw data load configuration (by default ogr2ogr converts to lowercase, option LAUNDER_ASCII=YES removes latin special characters, columns can be renamed with -sql option)
      const sanitizedField = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (sanitizedField === 'drop_records') continue;
      if (typeof mapping === 'string' || mapping instanceof String) {
        result.metadata_cols[mapping as string] = sanitizedField;
      } else if (typeof mapping === 'object') {
        const props = mapping as PropertyMapping;
        const propsProcessed: PropertyCleaningConfig = props;
        const spInfo = spInfoMap[props.property_slug];
        const ucInfo = props.conversion_slug ? (ucInfoMap[props.conversion_slug] ?? null) : null;
        const pInfo = props.procedure_slug ? (pInfoMap[props.procedure_slug] ?? null) : null;
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
    if (dataMapping.drop_records && Array.isArray(dataMapping.drop_records)) {
      result.drop_records = dataMapping.drop_records;
    }
    return result;
  };

  getDataMapping = async (requestData: RequestData, id: string): Promise<DataMappingObject> => {
    const repo = requestData.entityManager.getRepository(DataMappingEntity);
    const dataMapping = await repo.findOneBy({ id });
    if (!dataMapping) {
      throw new ErrorResponse(`Data mapping ${id} not found`, StatusCodes.NOT_FOUND);
    }
    return dataMapping.data_mapping;
  };
}
