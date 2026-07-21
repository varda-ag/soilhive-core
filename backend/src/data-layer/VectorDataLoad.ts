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
import { LayerFields } from '../types/DataMapping';
import { createCursor, decodeCursor, encodeCursor } from '../utils/cursor';
import { buildCleaningCte } from './CleaningCte';
import { CleaningReport, RowDeleteReason, CellDeleteReason, CellModifyReason } from '../interfaces/CleaningReport';

export default class VectorDataLoad {
  getDataPreview = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    fileId: string,
    limit: number = DATA_PREVIEW_SIZE,
    includeUserDropped: boolean = true,
    cursor?: string,
    sort?: string,
  ): Promise<SoilRecord[]> => {
    const { cte, values, propertyCols } = buildCleaningCte(dataMappingConfig, fileId);
    const extraValues: unknown[] = [];
    const p = (val: unknown) => {
      extraValues.push(val);
      return `$${values.length + extraValues.length}`;
    };

    const selectCols = [
      'record_id',
      'ST_AsGeoJSON(geom)::json AS geometry',
      'sampling_date',
      'horizon',
      'min_depth',
      'max_depth',
      'license',
      ...propertyCols.map(prop => `${prop}_cleaned AS ${prop}`),
    ];

    let sortKey: string | undefined;
    let sortExpr: string | undefined;
    let isDesc = false;
    let orderClause = 'ORDER BY record_id ASC';

    if (sort) {
      isDesc = sort.startsWith('-');
      sortKey = isDesc ? sort.substring(1) : sort;
      const dir = isDesc ? 'DESC' : 'ASC';
      sortExpr = buildSortExpr(sortKey, dataMappingConfig);
      orderClause = `ORDER BY ${sortExpr} ${dir} NULLS ${isDesc ? 'FIRST' : 'LAST'}, record_id ${dir}`;
    }

    let cursorClause = '';
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (sortExpr && decoded.column) {
        if (decoded.value !== null && decoded.value !== undefined) {
          const operator = isDesc ? '<' : '>';
          cursorClause = `AND (${sortExpr}, record_id) ${operator} (${p(decoded.value)}, ${p(decoded.id)})`;
        } else if (isDesc) {
          // DESC NULLS FIRST: remaining nulls (id < cursor) plus all non-null rows that follow
          cursorClause = `AND ((${sortExpr} IS NULL AND record_id < ${p(decoded.id)}) OR ${sortExpr} IS NOT NULL)`;
        } else {
          // ASC NULLS LAST: only remaining null rows with higher id
          cursorClause = `AND ${sortExpr} IS NULL AND record_id > ${p(decoded.id)}`;
        }
      } else {
        cursorClause = `AND record_id > ${p(decoded.id)}`;
      }
    }

    // User-dropped records are retained and marked as delete=true in the UI for the data preview, should be excluded from the response for the bulk-load
    const statusFilter = includeUserDropped
      ? `(final_row_delete_reason IS NULL OR final_row_delete_reason = '${RowDeleteReason.USER_DELETION}')`
      : `final_row_delete_reason IS NULL`;
    const sql = `
      ${cte}
      SELECT ${selectCols.join(', ')}, CASE WHEN final_row_delete_reason = '${RowDeleteReason.USER_DELETION}' THEN TRUE ELSE FALSE END AS user_dropped
      FROM cleaning_result
      WHERE ${statusFilter}
      ${cursorClause}
      ${orderClause}
      LIMIT ${parseInt(String(limit), 10)}
    `;
    const results = await entityManager.query(sql, [...values, ...extraValues]);
    return results.map((r: any) => {
      const cursorValue = sortKey ? r[sortKey] : undefined;
      const encodedCursor = encodeCursor(createCursor(String(r.record_id), sort, cursorValue));
      return { ...r, cursor: encodedCursor };
    });
  };

  getDataPreviewStats = async (
    entityManager: EntityManager,
    dataMappingConfig: DataCleaningConfig,
    fileId: string,
  ): Promise<CleaningReport> => {
    const { cte, values } = buildCleaningCte(dataMappingConfig, fileId);
    const query = `${cte},
      row_stats AS (
        SELECT final_row_delete_reason AS reason, COUNT(*)::int AS count
        FROM cleaning_result WHERE final_row_delete_reason IS NOT NULL
        GROUP BY final_row_delete_reason
      ),
      cell_delete_stats AS (
        SELECT val AS reason, key AS property, COUNT(*)::int AS count
        FROM cleaning_result,
            jsonb_each_text(cell_delete_reasons) AS t(key, val)
        WHERE cell_delete_reasons IS NOT NULL AND final_row_delete_reason IS NULL
        GROUP BY val, key
      ),
      cell_modify_stats AS (
        SELECT reason, COUNT(*)::int AS count
        FROM (
          SELECT jsonb_array_elements_text(arr) AS reason
          FROM cleaning_result,
              jsonb_each(cell_modify_reasons) AS t(prop, arr)
          WHERE cell_modify_reasons IS NOT NULL AND final_row_delete_reason IS NULL
        ) sub
        GROUP BY reason
      )
    SELECT
      (SELECT COUNT(*)::int FROM cleaning_result WHERE final_row_delete_reason IS NOT NULL) AS rows_deleted,
      (SELECT COALESCE(SUM(count),0)::int FROM cell_delete_stats)  AS cells_deleted,
      (SELECT COALESCE(SUM(count),0)::int FROM cell_modify_stats)  AS values_modified,
      (SELECT data_type FROM dominant_data_type)                   AS gis_datatype,
      (SELECT json_agg(row_stats)         FROM row_stats)           AS row_deletions,
      (SELECT json_agg(cell_delete_stats) FROM cell_delete_stats)   AS cell_deletions,
      (SELECT json_agg(cell_modify_stats) FROM cell_modify_stats)   AS modifications`;
    // Workaround using raw query to be able to use dynamic table name without entity
    const [row] = await entityManager.query(query, values);
    return {
      summary: {
        rows_deleted: row.rows_deleted,
        cells_deleted: row.cells_deleted,
        values_modified: row.values_modified,
      },
      gis_datatype: row.gis_datatype ?? null,
      row_deletions: (row.row_deletions ?? []).map((r: any) => ({ reason: r.reason as RowDeleteReason, count: r.count })),
      cell_deletions: (row.cell_deletions ?? []).map((r: any) => ({
        reason: r.reason as CellDeleteReason,
        property: r.property,
        count: r.count,
      })),
      modifications: (row.modifications ?? []).map((r: any) => ({ reason: r.reason as CellModifyReason, count: r.count })),
    };
  };

  getDataCount = async (entityManager: EntityManager, dataMappingConfig: DataCleaningConfig, fileId: string): Promise<number> => {
    const { cte, values } = buildCleaningCte(dataMappingConfig, fileId);
    const query = `${cte} SELECT COUNT(*) AS count
      FROM cleaning_result
      WHERE final_row_delete_reason IS NULL OR final_row_delete_reason = '${RowDeleteReason.USER_DELETION}'`;
    const result = await entityManager.query(query, values);
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
      if (sanitizedRecord[mappedData] !== null) {
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
  const propConfig = dataMappingConfig.property_cols[sortKey];
  if (propConfig) return `${sortKey}_cleaned`;
  return sortKey;
};
