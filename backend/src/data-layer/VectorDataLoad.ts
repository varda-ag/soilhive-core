import { EntityManager } from 'typeorm';
import { DATA_PREVIEW_SIZE } from '../constants/constants';
import { DataCleaningConfig } from '../interfaces/DataMapping';
import { SoilRecord } from '../interfaces/Record';
import FeatureEntity from '../entities/Feature';
import LicenseEntity from '../entities/License';
import LayerEntity from '../entities/Layer';
import DatasetLayerEntity from '../entities/DatasetLayer';
import ObservationEntity from '../entities/Observation';
import { sanitizeField } from '../utils/utils';

export default class VectorDataLoad {
  /**
   * TODO: add remaining ingestion related functions (load raw data)
   */
  getDataPreview = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    fileId: string,
    limit: number = DATA_PREVIEW_SIZE,
  ): Promise<SoilRecord[]> => {
    let query = entityManager.createQueryBuilder().from(`${process.env.POSTGRES_SCHEMA}.file_${sanitizeField(fileId)}_raw`, 'raw');
    query = getDataPreviewQuery(query, dataMappingConfig);
    // Workaround using raw query to be able to use dynamic table name without entity
    const results = await entityManager.query(...query.take(limit).getQueryAndParameters());
    return results;
  };

  rawRecordToDataModel = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    record: SoilRecord,
    datasetId: string,
  ): Promise<any> => {
    // Upsert feature by geom
    const feature = await entityManager
      .createQueryBuilder()
      .insert()
      .into(FeatureEntity)
      .values({
        geom: () => `ST_GeomFromGeoJSON(:geom)`,
      })
      .setParameter('geom', record.geometry)
      .orUpdate(['geom'], ['geom_hash'])
      .returning('id')
      .execute();
    const featureId = feature.raw[0]?.id;

    // Upsert license
    const license = record.license;
    let licenseId: string | null = null;
    if (license) {
      licenseId =
        (
          await entityManager.findOne(LicenseEntity, {
            where: [{ name: license }, { full_name: license }],
          })
        )?.id || null;
      if (!licenseId) {
        const newLicense = entityManager.create(LicenseEntity, { name: license });
        licenseId = (await entityManager.save(newLicense)).id;
      }
    }
    record.license = licenseId;

    // Dynamic layer select/insert
    const metadataVals: Record<string, any> = {};
    const metadataCols: string[] = [];
    for (const mappedData of Object.keys(dataMappingConfig.metadata_cols)) {
      metadataVals[mappedData] = record[mappedData];
      metadataCols.push(mappedData);
    }

    const layer = await entityManager
      .createQueryBuilder()
      .insert()
      .into(LayerEntity)
      .values(metadataVals)
      .orUpdate(metadataCols, metadataCols)
      .returning('id')
      .execute();
    const layerId = layer.raw[0]?.id;

    // create rows with internal mapping key
    const datasetLayerRows: Record<string, any>[] = [];
    const observationRows: Record<string, any>[] = [];

    for (const [col, data] of Object.entries(dataMappingConfig.property_cols)) {
      const value = record[col];
      if (!value) continue;

      const soilPropertyId: string = data.property_id!;

      datasetLayerRows.push({
        dataset_id: datasetId,
        layer_id: layerId!,
        feature_id: featureId!,
        soil_property_id: soilPropertyId,
        _key: `${datasetId}_${layerId}_${featureId}_${soilPropertyId}`,
      });

      const procedureId: string | null = data.procedure_id ?? null;

      observationRows.push({
        soil_property_key: `${datasetId}_${layerId}_${featureId}_${soilPropertyId}`,
        procedure_id: procedureId,
        value: value,
      });
    }
    const dedupedDatasetLayerRows = Array.from(new Map(datasetLayerRows.map(r => [r['_key'], r])).values());
    // upsert datasetLayers
    const insertedDatasetLayers = await entityManager
      .createQueryBuilder()
      .insert()
      .into(DatasetLayerEntity)
      .values(dedupedDatasetLayerRows)
      .orUpdate(['dataset_id', 'layer_id', 'feature_id', 'soil_property_id'], ['dataset_id', 'layer_id', 'feature_id', 'soil_property_id'])
      .returning(['id', 'dataset_id', 'layer_id', 'feature_id', 'soil_property_id'])
      .execute();

    const datasetLayerIdMap = new Map<string, string>();
    for (const row of insertedDatasetLayers.raw) {
      const key = `${row.dataset_id}_${row.layer_id}_${row.feature_id}_${row.soil_property_id}`;
      datasetLayerIdMap.set(key, row.id);
    }
    // prep observations with dataset_layer_id
    const finalObservationRows = observationRows.map(r => {
      const datasetLayerId = datasetLayerIdMap.get(r['soil_property_key']);
      if (!datasetLayerId) {
        throw new Error(`datasetLayerId missing for observation key: ${r['soil_property_key']}`);
      }
      return {
        dataset_layer_id: datasetLayerId,
        procedure_id: r['procedure_id'],
        value: r['value'],
      };
    });
    // upsert observations
    if (finalObservationRows.length > 0) {
      await entityManager
        .createQueryBuilder()
        .insert()
        .into(ObservationEntity)
        .values(finalObservationRows)
        .orUpdate(['dataset_layer_id', 'procedure_id', 'value'], ['dataset_layer_id', 'procedure_id', 'value'])
        .execute();
    }
  };
}

const getDataPreviewQuery = (query: any, dataMappingConfig: DataCleaningConfig): any => {
  query.select('raw.record_id', 'record_id');

  for (const [mapping, field] of Object.entries(dataMappingConfig.metadata_cols)) {
    if (field) {
      query.addSelect(field, mapping);
    } else {
      query.addSelect('NULL', mapping);
    }
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
  query.addSelect('ST_AsGeoJSON(raw.geometry)', 'geometry');

  if (dataMappingConfig.drop_records) {
    query = query.where('raw.record_id NOT IN (:...drop_records)', { drop_records: dataMappingConfig.drop_records });
  }
  return query;
};
