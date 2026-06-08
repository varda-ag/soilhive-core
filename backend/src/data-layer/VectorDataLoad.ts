import { EntityManager } from 'typeorm';
import { DATA_PREVIEW_SIZE, OUTSIDE_LOD_VALUE } from '../constants/constants';
import { DataCleaningConfig } from '../interfaces/DataMapping';
import { SoilRecord } from '../interfaces/Record';
import FeatureEntity from '../entities/Feature';
import LicenseEntity from '../entities/License';
import LayerEntity from '../entities/Layer';
import DatasetLayerEntity from '../entities/DatasetLayer';
import ObservationEntity from '../entities/Observation';
import { getRawTableName, sanitizeField } from '../utils/utils';
import { DetectableFields, LayerFields } from '../types/DataMapping';
import { createCursor, decodeCursor, encodeCursor } from '../utils/cursor';

export default class VectorDataLoad {
  getDataPreview = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    fileId: string,
    limit: number = DATA_PREVIEW_SIZE,
    cursor?: string,
    sort?: string,
  ): Promise<SoilRecord[]> => {
    const table = `${process.env.POSTGRES_SCHEMA}.${getRawTableName(fileId)}`;
    let query = entityManager.createQueryBuilder().from(table, 'raw');
    query = getDataPreviewQuery(query, dataMappingConfig, cursor, sort);
    // Workaround using raw query to be able to use dynamic table name without entity
    const results = await entityManager.query(...query.take(limit).getQueryAndParameters());
    const sortKey = sort ? (sort.startsWith('-') ? sort.substring(1) : sort) : undefined;
    const cursorCol = sortKey ? `_cursor_${sortKey}` : undefined;
    return results.map((r: any) => {
      const cursorValue = cursorCol ? r[cursorCol] : undefined;
      const cursor = encodeCursor(createCursor(String(r.record_id), sort, cursorValue));
      const record = { ...r, geometry: JSON.parse(r.geometry) };
      if (cursorCol) delete record[cursorCol];
      return { ...record, cursor };
    });
  };

  getDataCount = async (entityManager: EntityManager, dataMappingConfig: DataCleaningConfig, fileId: string): Promise<number> => {
    const table = `${process.env.POSTGRES_SCHEMA}.${getRawTableName(fileId)}`;
    let query = entityManager.createQueryBuilder().from(table, 'raw').select('COUNT(*)', 'count');
    if (dataMappingConfig.drop_records && dataMappingConfig.drop_records.length > 0) {
      query = query.andWhere('raw.record_id NOT IN (:...drop_records)', { drop_records: dataMappingConfig.drop_records });
    }
    const result = await entityManager.query(...query.getQueryAndParameters());
    return parseInt(result[0].count, 10);
  };

  rawRecordToDataModel = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    record: SoilRecord,
    datasetId: string,
  ): Promise<any> => {
    const sanitizedRecord = Object.fromEntries(
      Object.entries(record).map(([key, value]) => {
        return [sanitizeField(key), value];
      }),
    ) as SoilRecord;
    // Upsert feature by geom
    const feature = await entityManager
      .createQueryBuilder()
      .insert()
      .into(FeatureEntity)
      .values({
        geom: () => `ST_GeomFromGeoJSON(:geom)`,
      })
      .setParameter('geom', sanitizedRecord.geometry)
      .orUpdate(['geom'], ['geom_hash'])
      .returning('id')
      .execute();
    const featureId = feature.raw[0]?.id;

    // Upsert license
    const license = sanitizedRecord.license;
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
    sanitizedRecord.license = licenseId;

    // Dynamic layer select/insert
    const metadataVals: Record<string, any> = {};
    const metadataCols: string[] = [];
    for (const mappedData of Object.values(LayerFields)) {
      if (sanitizedRecord[mappedData]) {
        metadataVals[mappedData] = sanitizedRecord[mappedData];
      }
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
      const value = sanitizedRecord[col];
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
    if (insertedDatasetLayers.raw) {
      for (const row of insertedDatasetLayers.raw) {
        const key = `${row.dataset_id}_${row.layer_id}_${row.feature_id}_${row.soil_property_id}`;
        datasetLayerIdMap.set(key, row.id);
      }
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

const buildSortExpr = (sortKey: string, dataMappingConfig: DataCleaningConfig): string => {
  const metadataCol = dataMappingConfig.metadata_cols[sortKey];
  if (metadataCol) return `raw.${metadataCol}`;
  const propConfig = dataMappingConfig.property_cols[sortKey];
  if (propConfig) {
    const formula = propConfig.conversion_formula?.replace(/"/g, '').trim() ?? null;
    const expr = formula ? formula.replace(/x/g, `(raw.${sortKey})::numeric`) : `(raw.${sortKey})::numeric`;
    return `CASE WHEN ROUND(${sortKey}::numeric, 3)=${OUTSIDE_LOD_VALUE} THEN ROUND(${sortKey}::numeric, 3) ELSE ROUND(${expr},3) END`;
  }
  return `NULL`; // unmapped required columns
};

const getDataPreviewQuery = (query: any, dataMappingConfig: DataCleaningConfig, cursor?: string, sort?: string): any => {
  query.select('raw.record_id', 'record_id');
  if (sort) {
    const isDesc = sort.startsWith('-');
    const sortKey = isDesc ? sort.substring(1) : sort;
    const dir = isDesc ? 'DESC' : 'ASC';
    const sortExpr = buildSortExpr(sortKey, dataMappingConfig);
    // Hidden column carrying the sort expression value for cursor encoding.
    // Uses the raw expression without the CASE/min-max wrapper so the cursor
    // value is always non-NULL even when the visible SELECT output is NULL.
    query.addSelect(sortExpr, `_cursor_${sortKey}`);
    query.orderBy(`_cursor_${sortKey}`, dir);
    query.addOrderBy('raw.record_id', dir);
  } else {
    query.orderBy('raw.record_id', 'ASC');
  }
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (sort && decoded.column) {
      const isDesc = sort.startsWith('-');
      const sortKey = isDesc ? sort.substring(1) : sort;
      const sortExpr = buildSortExpr(sortKey, dataMappingConfig);
      if (decoded.value !== null && decoded.value !== undefined) {
        const operator = isDesc ? '<' : '>';
        query.andWhere(`(${sortExpr}, raw.record_id) ${operator} (:cursorValue, :cursorId)`, {
          cursorValue: decoded.value,
          cursorId: decoded.id,
        });
      } else if (isDesc) {
        // DESC NULLS FIRST: remaining nulls (id < cursor) plus all non-null rows that follow
        query.andWhere(`((${sortExpr} IS NULL AND raw.record_id < :cursorId) OR ${sortExpr} IS NOT NULL)`, { cursorId: decoded.id });
      } else {
        // ASC NULLS LAST: only remaining null rows with higher id
        query.andWhere(`${sortExpr} IS NULL AND raw.record_id > :cursorId`, { cursorId: decoded.id });
      }
    } else {
      query.andWhere('raw.record_id > :cursorId', { cursorId: decoded.id });
    }
  }

  for (const [mapping, field] of Object.entries(dataMappingConfig.metadata_cols)) {
    if (mapping === DetectableFields.SAMPLING_DATE) {
      query.addSelect(`${field}::text`, mapping);
      continue;
    }
    if (mapping === DetectableFields.MIN_DEPTH || mapping === DetectableFields.MAX_DEPTH) {
      query.addSelect(`CASE WHEN ${field}::integer < 0 THEN NULL ELSE ${field}::integer END`, mapping);
      continue;
    }
    if (mapping === DetectableFields.DEPTH) {
      query.addSelect(
        `NULLIF(regexp_replace(split_part(${field}::text, '-', 1), '[^0-9]', '', 'g'), '')::integer`,
        DetectableFields.MIN_DEPTH,
      );
      query.addSelect(
        `NULLIF(regexp_replace(split_part(${field}::text, '-', 2), '[^0-9]', '', 'g'), '')::integer`,
        DetectableFields.MAX_DEPTH,
      );
      continue;
    }
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
    const expr = conversionFormula
      ? conversionFormula.replace(/x/g, `NULLIF((raw.${field})::numeric, 0)`)
      : `NULLIF((raw.${field})::numeric, 0)`;

    const max_val = props.max_val ?? (props.standard_unit === '%' ? 100 : undefined);
    const min_val = props.min_val ?? 0;

    if (min_val !== undefined && max_val !== undefined) {
      propertyCleanup = `CASE WHEN (raw.${field})::numeric=${OUTSIDE_LOD_VALUE} THEN (raw.${field})::numeric WHEN ${expr} BETWEEN :min_val${field} AND :max_val${field} THEN ROUND(${expr},3) ELSE NULL END`;
    } else if (min_val !== undefined) {
      propertyCleanup = `CASE WHEN (raw.${field})::numeric=${OUTSIDE_LOD_VALUE} THEN (raw.${field})::numeric WHEN ${expr} >= :min_val${field} THEN ROUND(${expr},3) ELSE NULL END`;
    } else if (max_val !== undefined) {
      propertyCleanup = `CASE WHEN (raw.${field})::numeric=${OUTSIDE_LOD_VALUE} THEN (raw.${field})::numeric WHEN ${expr} <= :max_val${field} THEN ROUND(${expr},3) ELSE NULL END`;
    } else {
      propertyCleanup = `CASE WHEN (raw.${field})::numeric=${OUTSIDE_LOD_VALUE} THEN (raw.${field})::numeric ELSE ROUND(${expr},3) END`;
    }
    params[`min_val${field}`] = min_val;
    params[`max_val${field}`] = max_val;
    query.addSelect(propertyCleanup, field);
  }
  query.setParameters(params);
  query.addSelect('ST_AsGeoJSON(raw.geometry)', 'geometry');

  if (dataMappingConfig.drop_records && dataMappingConfig.drop_records.length > 0) {
    query = query.andWhere('raw.record_id NOT IN (:...drop_records)', { drop_records: dataMappingConfig.drop_records });
  }
  return query;
};
