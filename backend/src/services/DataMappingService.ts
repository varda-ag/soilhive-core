import { StatusCodes } from 'http-status-codes';
import { In } from 'typeorm';
import { DataMapping, DataMappingObject, DataCleaningConfig } from '../interfaces/DataMapping';
import { PropertyMapping, PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import DataMappingEntity from '../entities/DataMapping';
import UnitConversionEntity from '../entities/UnitConversion';
import FileEntity from '../entities/File';

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

    const uc_repo = requestData.entityManager.getRepository(UnitConversionEntity);
    const propInfos: UnitConversionEntity[] = conversionSlugs.length > 0 ? await uc_repo.findBy({ slug: In(conversionSlugs) }) : [];

    const propInfoMap = propInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, UnitConversionEntity>,
    );

    // Process metadata (string types) and property columns (object types)
    for (const [field, mapping] of Object.entries(dataMapping)) {
      // TODO: update based on raw data load configuration (by default ogr2ogr converts to lowercase, option LAUNDER_ASCII=YES removes latin special characters, columns can be renamed with -sql option)
      const sanitizedField = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (sanitizedField === 'drop_records') continue;
      if (typeof mapping === 'string' || mapping instanceof String) {
        result.metadata_cols[sanitizedField] = mapping as string;
      } else if (typeof mapping === 'object') {
        const props = mapping as PropertyMapping;
        const propsProcessed: PropertyCleaningConfig = props;
        const propInfo = props.conversion_slug ? (propInfoMap[props.conversion_slug] ?? null) : null;
        propsProcessed.conversion_formula = propInfo?.conversion_formula;
        result.property_cols[sanitizedField] = propsProcessed;
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
