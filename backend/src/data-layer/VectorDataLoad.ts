import { EntityManager } from 'typeorm';
import { DATA_PREVIEW_SIZE } from '../constants/constants';
import { DataCleaningConfig } from '../interfaces/DataMapping';

export default class VectorDataLoad {
  /**
   * TODO: add remaining ingestion related functions (raw data to data model, load raw data), rename DataPreview (clashing concept)
   */
  getDataPreview = async (entityManager: EntityManager, dataMappingConfig: DataCleaningConfig, nRecords: number = DATA_PREVIEW_SIZE, includeGeom: boolean = true): Promise<any> => {
    let query = await entityManager
      .createQueryBuilder()
      .from(`file_${dataMappingConfig.file_id}_raw`, 'raw');
    query = getDataPreviewQuery(query, dataMappingConfig, includeGeom);
    // Workaround using raw query to be able to use dynamic table name without entity
    const results = await entityManager.query(...query.take(nRecords).getQueryAndParameters());
    return results;
  };
};

const getDataPreviewQuery = (query: any, dataMappingConfig: DataCleaningConfig, includeGeom: boolean = true): any => {
  query.select('raw.record_id', 'record_id');

  for (const [field, mapping] of Object.entries(dataMappingConfig.metadata_cols)) {
    query.addSelect(field, mapping);
  }
  // Process metadata (string types) and property columns (object types)
  const params: Record<string, any> = {};
  for (const [field, props] of Object.entries(dataMappingConfig.property_cols)) {
    let propertyCleanup: string = '';

    const conversionFormula = props?.conversion_formula ? props.conversion_formula.replace(/"/g, '').trim() : null;
    const expr = conversionFormula ? conversionFormula.replace(/x/g, `(raw."${field}")::numeric`) : `(raw."${field}")::numeric`;

    if (props.min_val !== undefined && props.max_val !== undefined) {
      propertyCleanup = `CASE WHEN ${expr} BETWEEN :min_val${field} AND :max_val${field} THEN ${expr} ELSE NULL END`;
    } else if (props.min_val !== undefined) {
      propertyCleanup = `CASE WHEN ${expr} >= :min_val${field} THEN ${expr} ELSE NULL END`;
    } else if (props.max_val !== undefined) {
      propertyCleanup = `CASE WHEN ${expr} <= :max_val${field} THEN ${expr} ELSE NULL END`;
    } else {
      propertyCleanup = expr;
    }
    params[`min_val${field}`] = props.min_val;
    params[`max_val${field}`] = props.max_val;
    query.addSelect(propertyCleanup, field);
  }
  query.setParameters(params);
  if (includeGeom) {
    query.addSelect('raw.geom', 'geom');
  }

  if (dataMappingConfig.drop_records) {
    query = query.where('raw.record_id NOT IN (:...drop_records)', { drop_records: dataMappingConfig.drop_records });
  }
  return query;
};
