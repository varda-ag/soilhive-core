import { DataSource } from 'typeorm';
import { PropertyMapping } from '../interfaces/PropertyMapping';
import UnitConversionEntity from '../entities/UnitConversion';
import DataMappingEntity from '../entities/DataMapping';
import { PREVIEW_PAGE_SIZE } from '../constants/constants';

export default class VectorDataLoad {
  /**
   * TODO: add remaining ingestion related functions (raw data to data model, load raw data), rename DataPreview (clashing concept)
   */
  getDataPreview = async (dataSource: DataSource, fileId: string, dataMappingId: string): Promise<any> => {
    const repo = dataSource.getRepository(DataMappingEntity);
    const mapping = await repo.findOneBy({ id: dataMappingId });

    if (!mapping?.data_mapping) {
      throw new Error('Data mapping not found');
    }
    const dataMapping: any = mapping.data_mapping;

    // Process property columns (object types) - equivalent to jsonb_each
    let propertiesCleanup = '';
    let metadataCols = '';
    for (const [field, mapping] of Object.entries(dataMapping)) {
      if (typeof mapping === 'string' || mapping instanceof String) {
        // metadata fields
        metadataCols += `"${field}" AS "${mapping}", `;
      } else if (typeof mapping === 'object') {
        const props = mapping as PropertyMapping;
        const uc_repo = dataSource.getRepository(UnitConversionEntity);

        const propInfo: UnitConversionEntity | null =
          props.conversion_slug !== undefined ? await uc_repo.findOneBy({ slug: props.conversion_slug }) : null;

        const conversionFormula = propInfo?.conversion_formula ? propInfo.conversion_formula.replace(/"/g, '').trim() : null;

        const expr = conversionFormula ? conversionFormula.replace(/x/g, `(raw."${field}")::numeric`) : `(raw."${field}")::numeric`;

        if (props.min_val !== undefined && props.max_val !== undefined) {
          propertiesCleanup += `CASE WHEN ${expr} BETWEEN ${props.min_val} AND ${props.max_val} THEN ${expr} ELSE NULL END AS "${field}", `;
        } else if (props.min_val !== undefined) {
          propertiesCleanup += `CASE WHEN ${expr} > ${props.min_val} THEN ${expr} ELSE NULL END AS "${field}", `;
        } else if (props.max_val !== undefined) {
          propertiesCleanup += `CASE WHEN ${expr} < ${props.max_val} THEN ${expr} ELSE NULL END AS "${field}", `;
        } else {
          propertiesCleanup += `${expr} AS "${field}", `;
        }
      }
    }

    let query = await dataSource
      .createQueryBuilder()
      .select(['raw.record_id as record_id', metadataCols.replace(/, $/, ''), propertiesCleanup.replace(/, $/, ''), 'raw.geom'])
      .from(`file_${fileId}_raw`, 'raw');

    if (dataMapping.drop_records && Array.isArray(dataMapping.drop_records)) {
      query = query.where('raw.record_id IN (:...drop_records)', { drop_records: dataMapping.drop_records });
    }
    // Workaround using raw query to be able to use dynamic table name without entity
    const results = await dataSource.manager.query(query.take(PREVIEW_PAGE_SIZE).getSql());
    return results;
  };
}
