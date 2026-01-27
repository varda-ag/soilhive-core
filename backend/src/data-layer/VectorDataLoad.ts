import { EntityManager, In } from 'typeorm';
import { DATA_PREVIEW_SIZE } from '../constants/constants';
import { DataCleaningConfig } from '../interfaces/DataMapping';
import { PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import FeatureEntity from '../entities/Feature';
import LicenseEntity from '../entities/License';
import LayerEntity from '../entities/Layer';
import DatasetLayerEntity from '../entities/DatasetLayer';
import ObservationEntity from '../entities/Observation';
import SoilPropertyEntity from '../entities/SoilProperty';
import ProcedureEntity from '../entities/Procedure';

export default class VectorDataLoad {
  /**
   * TODO: add remaining ingestion related functions (load raw data), rename DataPreview (clashing concept)
   */
  getDataPreview = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    nRecords: number = DATA_PREVIEW_SIZE,
    includeGeom: boolean = true,
  ): Promise<any> => {
    let query = await entityManager.createQueryBuilder().from(`file_${dataMappingConfig.file_id}_raw`, 'raw');
    query = getDataPreviewQuery(query, dataMappingConfig, includeGeom);
    // Workaround using raw query to be able to use dynamic table name without entity
    const results = await entityManager.query(...query.take(nRecords).getQueryAndParameters());
    return results;
  };

  rawRecordToDataModel = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    recordId: number,
    datasetId: string,
  ): Promise<any> => {
    const FeatureRepo = entityManager.getRepository(FeatureEntity);
    const LicenseRepo = entityManager.getRepository(LicenseEntity);
    const LayerRepo = entityManager.getRepository(LayerEntity);
    const DatasetLayerRepo = entityManager.getRepository(DatasetLayerEntity);
    const ObservationRepo = entityManager.getRepository(ObservationEntity);
    const SoilPropertyRepo = entityManager.getRepository(SoilPropertyEntity);
    const ProcedureRepo = entityManager.getRepository(ProcedureEntity);

    let subQuery = await entityManager.createQueryBuilder().from(`file_${dataMappingConfig.file_id}_raw`, 'raw');
    subQuery = getDataPreviewQuery(subQuery, dataMappingConfig);

    const record = await entityManager
      .createQueryBuilder()
      .select('*, ST_AsGeoJSON(geom) as geom_geojson')
      .from(`(${subQuery.getQuery()})`, 'cleaned')
      .setParameters(subQuery.getParameters())
      .where('cleaned.record_id = :record_id', { record_id: recordId })
      .getRawOne();

    if (!record) throw new Error('Record not found');

    // Upsert feature by geom
    const feature = await FeatureRepo.createQueryBuilder()
      .insert()
      .into(FeatureEntity)
      .values({
        geom: () => `ST_GeomFromGeoJSON(:geom)`,
      })
      .setParameter('geom', record.geom_geojson)
      .orUpdate(['geom'], ['geom_hash'])
      .returning('id')
      .execute();
    const featureId = feature.raw[0]?.id;

    // Upsert license
    let licenseId: string | null = null;
    if (record.license) {
      licenseId =
        (
          await LicenseRepo.findOne({
            where: [{ name: record.license }, { full_name: record.license }],
          })
        )?.id || null;
      if (!licenseId && record.license) {
        const newLicense = LicenseRepo.create({ name: record.license });
        licenseId = (await entityManager.save(newLicense)).id;
      }
    }
    record.license = licenseId;

    const propertySlugs: string[] = Object.values(dataMappingConfig.property_cols).map(
      mapping => (mapping as PropertyCleaningConfig).property_slug,
    );

    const soilPropInfos: SoilPropertyEntity[] = propertySlugs.length > 0 ? await SoilPropertyRepo.findBy({ slug: In(propertySlugs) }) : [];

    const soilPropMap = soilPropInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, SoilPropertyEntity>,
    );

    const procedureSlugs: string[] = Object.values(dataMappingConfig.property_cols)
      .filter(mapping => (mapping as PropertyCleaningConfig).procedure_slug !== undefined)
      .map(mapping => (mapping as PropertyCleaningConfig).procedure_slug!);

    const procedureInfos: ProcedureEntity[] = propertySlugs.length > 0 ? await ProcedureRepo.findBy({ slug: In(procedureSlugs) }) : [];

    const procedureMap = procedureInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, ProcedureEntity>,
    );

    // Dynamic layer select/insert
    const metadataVals: Record<string, any> = {};
    const metadataCols: string[] = [];
    for (const mappedData of Object.keys(dataMappingConfig.metadata_cols)) {
      metadataVals[mappedData] = record[mappedData];
      metadataCols.push(mappedData);
    }

    const layer = await LayerRepo.createQueryBuilder()
      .insert()
      .into(LayerEntity)
      .values(metadataVals)
      .orUpdate(metadataCols, metadataCols)
      .returning('id')
      .execute();
    const layerId = layer.raw[0]?.id;

    for (const [col, data] of Object.entries(dataMappingConfig.property_cols)) {
      const value = record[col];
      if (value) {
        const soilPropertyId: string = soilPropMap[data.property_slug];
        // Upsert dataset_layer
        const datasetLayer = await DatasetLayerRepo.createQueryBuilder()
          .insert()
          .into(DatasetLayerEntity)
          .values({
            dataset_id: datasetId,
            layer_id: layerId!,
            feature_id: featureId!,
            soil_property_id: soilPropertyId!,
          })
          .orUpdate(
            ['dataset_id', 'layer_id', 'feature_id', 'soil_property_id'],
            ['dataset_id', 'layer_id', 'feature_id', 'soil_property_id'],
          )
          .returning('id')
          .execute();
        const datasetLayerId = datasetLayer.raw[0]?.id;

        const procedureId: string = data.procedure_slug ? (procedureMap[data.procedure_slug] ?? null) : null;
        // Upsert observation
        await ObservationRepo.createQueryBuilder()
          .insert()
          .into(ObservationEntity)
          .values({
            dataset_layer_id: datasetLayerId,
            procedure_id: procedureId,
            value: value,
          })
          .orUpdate(['dataset_layer_id', 'procedure_id', 'value'], ['dataset_layer_id', 'procedure_id', 'value'])
          .returning('id')
          .execute();
      }
    }
  };
}

const getDataPreviewQuery = (query: any, dataMappingConfig: DataCleaningConfig, includeGeom: boolean = true): any => {
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
  if (includeGeom) {
    query.addSelect('raw.geom', 'geom');
  }

  if (dataMappingConfig.drop_records) {
    query = query.where('raw.record_id NOT IN (:...drop_records)', { drop_records: dataMappingConfig.drop_records });
  }
  return query;
};
