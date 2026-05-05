import * as turf from '@turf/turf';
import { Polygon, MultiPolygon, Feature } from 'geojson';
import { Capability, OverlapType } from '../types/enums';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { FilteredDatasetSummary, FilteredDataset, FilterCriteria, DataFilter } from '../interfaces/DatasetFilter';
import DatasetEntity from '../entities/Dataset';
import DatasetLayerEntity from '../entities/DatasetLayer';
import { SoilDataSample } from '../interfaces/SoilDataSample';
import assert from 'assert';
import { createCursor, decodeCursor, encodeCursor } from '../utils/cursor';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import RasterFilterService from '../services/RasterFilterService';
import { getDataSource } from '../utils/data-source';
import { selectOverviewTable } from '../utils/raster';
import { RequestData } from '../interfaces/RequestData';
import EntitlementService from '../services/EntitlementService';

const AREA_THRESHOLD_M2 = 7_000_000 * 1_000 * 1_000; // 7,000,000 km²

const rasterFilterService = new RasterFilterService();
const entitlementService = new EntitlementService();

export default class SoilDataStorage {
  /**
   * @returns A map of dataset UUIDs to their overlap type with the provided geometry
   */
  getOverlapType = async (entityManager: EntityManager, geometry: Polygon | MultiPolygon): Promise<Map<string, OverlapType>> => {
    const repo = entityManager.getRepository(DatasetEntity);
    const results = await repo
      .createQueryBuilder('datasets')
      .addCommonTableExpression(selectGeometry(), 'input')
      .select([
        'datasets.id as dataset_id',
        `CASE 
            WHEN ST_Contains(input.geom, datasets.spatial_extent) THEN 'full'
            WHEN ST_Intersects(input.geom, datasets.spatial_extent) THEN 'partial'
            ELSE 'none'
        END as overlap_type`,
      ])
      .where('datasets.spatial_extent IS NOT NULL')
      .from('input', 'input')
      .setParameter('inputGeom', JSON.stringify(geometry))
      .getRawMany();
    return new Map(results.map(row => [row.dataset_id, row.overlap_type as OverlapType]));
  };

  filter = async (
    entityManager: EntityManager,
    geometry: Polygon | MultiPolygon,
    filters: FilterCriteria,
  ): Promise<FilteredDatasetSummary[]> => {
    await entityManager.query("SET LOCAL work_mem = '256MB';");
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const baseAggQuery = repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.layer', 'layer')
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('layer.license', 'license')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .addSelect('MIN(layer.sampling_date)', 'min_sampling_date')
      .addSelect('MAX(layer.sampling_date)', 'max_sampling_date')
      .addSelect('MIN(layer.min_depth)', 'min_depth')
      .addSelect('MAX(layer.max_depth)', 'max_depth')
      .addSelect("STRING_AGG(DISTINCT layer.horizon, ',')", 'horizons')
      .addSelect('dataset_layers.soil_property_id', 'soil_property')
      .groupBy('dataset_layers.dataset_id, dataset_layers.soil_property_id, layer.license');

    const dataFilter = { geometries: [geometry], parameters: filters };
    const enabledRasterFilterTables = await getEnabledRasterFilterTables();
    await applyFiltersToQuery(baseAggQuery, dataFilter, enabledRasterFilterTables);

    const query = entityManager.createQueryBuilder();
    applyFiltersToExternalQuery(query, dataFilter, enabledRasterFilterTables);

    query
      .addCommonTableExpression(baseAggQuery, 'base_agg')
      .from('base_agg', 'base_agg')
      .innerJoin('datasets', 'ds', 'ds.id = base_agg.dataset_id')
      .leftJoin('soil_properties', 'soil_property', 'soil_property.id = base_agg.soil_property')
      .leftJoin('licenses', 'license', 'license.id = base_agg.license')
      .select('base_agg.dataset_id', 'dataset_id')
      .addSelect('ds.gis_datatype', 'gis_datatype')
      .addSelect('ds.name', 'dataset_name')
      .addSelect('ds.slug', 'dataset_slug')
      .addSelect("STRING_AGG(DISTINCT license.slug, ',')", 'licenses')
      .addSelect('SUM(base_agg.dataset_layer_count)', 'dataset_layer_count')
      .addSelect('MIN(base_agg.min_sampling_date)', 'min_sampling_date')
      .addSelect('MAX(base_agg.max_sampling_date)', 'max_sampling_date')
      .addSelect('MIN(base_agg.min_depth)', 'min_depth')
      .addSelect('MAX(base_agg.max_depth)', 'max_depth')
      .addSelect("STRING_AGG(DISTINCT base_agg.horizons, ',')", 'horizons')
      .addSelect("STRING_AGG(DISTINCT soil_property.slug, ',')", 'soil_properties')
      .groupBy('base_agg.dataset_id, ds.slug, ds.name, ds.gis_datatype');

    const results = await query.getRawMany();

    return results.map(row => ({
      id: row.dataset_slug,
      name: row.dataset_name,
      data_type: row.gis_datatype,
      licenses: row.licenses ? row.licenses.split(',') : [],
      min_sampling_date: row.min_sampling_date,
      max_sampling_date: row.max_sampling_date,
      min_depth: row.min_depth !== null ? parseFloat(row.min_depth) : null,
      max_depth: row.max_depth !== null ? parseFloat(row.max_depth) : null,
      // TODO: to be restored  and deduplicated here due to lack of support for LATERAL JOINs in typeorm:
      // horizons: row.horizons ? [new Set(...row.horizons.split(','))] : [],
      soil_properties: row.soil_properties ? row.soil_properties.split(',') : [],
      dataset_layer_count: parseInt(row.dataset_layer_count),
    }));
  };

  filterDatasets = async (
    entityManager: EntityManager,
    geometry: Polygon | MultiPolygon,
    filters: FilterCriteria,
  ): Promise<FilteredDataset[]> => {
    await entityManager.query("SET LOCAL work_mem = '256MB';");
    const schema = process.env.POSTGRES_SCHEMA;
    const params: any[] = [];
    const p = (val: any) => {
      params.push(val);
      return `$${params.length}`;
    };

    const geomParam = p(JSON.stringify(geometry));
    const { outerWhere, lateralJoins, lateralWhere } = buildDatasetFilterClauses(filters, p, schema!);

    const enabledRasterFilterTables = await getEnabledRasterFilterTables();
    const { ctes: rasterCtes, usesMatchingFeatures } = buildRasterSql(
      { geometries: [geometry], parameters: filters },
      enabledRasterFilterTables,
    );

    // When raster filters are active, matching_features already enforces spatial intersection
    // via candidate_features — drop the redundant ST_Intersects check from the LATERAL
    const featureSource = usesMatchingFeatures ? 'matching_features' : `${schema}.features`;
    const effectiveLateralWhere = usesMatchingFeatures ? lateralWhere.slice(1) : lateralWhere;

    const sql = `
      WITH
      aoi AS MATERIALIZED (
        SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geomParam}), 'method=structure'), 3) AS geom
      )${rasterCtes ? `,\n      ${rasterCtes}` : ''}
      SELECT ds.slug AS id, ds.name, ds.gis_datatype AS data_type
      FROM ${schema}.datasets ds
      CROSS JOIN LATERAL (
        SELECT 1
        FROM ${schema}.dataset_layers dl
        INNER JOIN ${featureSource} f ON f.id = dl.feature_id
        ${lateralJoins.join('\n        ')}
        WHERE dl.dataset_id = ds.id
            ${effectiveLateralWhere.length > 0 ? ` AND ${effectiveLateralWhere.join('\n          AND ')}` : ''}
        LIMIT 1
      ) first_match
      WHERE ${outerWhere.join('\n        AND ')}
    `;

    return entityManager.query(sql, params);
  };

  getSoilData = async (
    requestData: RequestData,
    dataFilter: DataFilter,
    datasetSlugs: string[],
    limit: number,
    cursor?: string,
    sort?: string,
  ): Promise<SoilDataSample[]> => {
    // Checking entitlements
    await entitlementService.enforceEntitlements(requestData, datasetSlugs, Capability.PREVIEW);

    // Wrap everything in a transaction to preserve 'SET LOCAL' scope
    return await requestData.entityManager.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.query("SET LOCAL work_mem = '256MB';");
      await transactionalEntityManager.query("SET LOCAL statement_timeout = '60s';");

      const enabledRasterFilterTables = await getEnabledRasterFilterTables();
      const { sql, params } = buildRawSoilQuery(dataFilter, datasetSlugs, {
        limit,
        cursor,
        sort,
        mode: 'data',
        enabledRasterFilterTables,
      });

      const results = await transactionalEntityManager.query(sql, params);

      return results.map((row: any) => dataRowTranslation(row, sort));
    });
  };

  getSoilDataCount = async (requestData: RequestData, dataFilter: DataFilter, datasetSlugs: string[]): Promise<number> => {
    return await requestData.entityManager.transaction(async transactionalEntityManager => {
      await transactionalEntityManager.query("SET LOCAL work_mem = '256MB';");
      await transactionalEntityManager.query("SET LOCAL statement_timeout = '60s';");

      const enabledRasterFilterTables = await getEnabledRasterFilterTables();
      const { sql, params } = buildRawSoilQuery(dataFilter, datasetSlugs, {
        mode: 'count',
        enabledRasterFilterTables,
      });

      const result = await transactionalEntityManager.query(sql, params);

      return parseInt(result[0].count, 10);
    });
  };

  buildSoilBaseQuery = async (
    entityManager: EntityManager,
    dataFilter: DataFilter,
    datasetSlugs: string[],
  ): Promise<SelectQueryBuilder<DatasetLayerEntity>> => {
    assert(datasetSlugs.length > 0, 'At least one dataset slug must be provided');

    await entityManager.query("SET LOCAL work_mem = '256MB';");

    const repo = entityManager.getRepository(DatasetLayerEntity);
    const schema = process.env.POSTGRES_SCHEMA;

    const query = repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.layer', 'layer')
      .leftJoin('dataset_layers.soil_property', 'soil_property')
      .leftJoin('layer.license_obj', 'license')
      .innerJoin('observations', 'obs', 'obs.dataset_layer_id = dataset_layers.id')
      .leftJoin('obs.procedure', 'procedure')
      .where('ds.slug IN (:...datasetSlugs)', { datasetSlugs });

    joinProcedures(query);

    // Resolve dataset slug → ID early, so the planner can use it to
    // filter dataset_layers via index before touching observations
    query.addCommonTableExpression(
      `SELECT ds_inner.id
     FROM ${schema}.datasets ds_inner
     WHERE ds_inner.slug IN (:...datasetSlugs)
       AND ds_inner.deleted_at IS NULL`,
      'target_dataset',
      { materialized: true },
    );

    // Force dataset_layers to be filtered by dataset_id index from the start
    query.andWhere(`dataset_layers.dataset_id IN (SELECT id FROM target_dataset)`);

    const enabledRasterFilterTables = await getEnabledRasterFilterTables();
    await applyFiltersToQuery(query, dataFilter, enabledRasterFilterTables);
    applyFiltersToExternalQuery(query, dataFilter, enabledRasterFilterTables);

    return query;
  };

  getRasterCoverage = async (
    entityManager: EntityManager,
    geometries: (Polygon | MultiPolygon)[],
    raster_filters?: Record<string, number[]>,
  ): Promise<Record<string, number[]>> => {
    if (geometries.length === 0) {
      // No input geometry, raster coverage cannot be applied
      return {};
    }
    const enabledRasterFilterTables = await getEnabledRasterFilterTables();

    if (enabledRasterFilterTables.length === 0) {
      // No raster data is available
      return {};
    }

    const geomJson = JSON.stringify(geometryUnion(geometries));
    const aoiAreaM2 = turf.area(geometries[0]!);
    const calculateRealCoverage = aoiAreaM2 < 3_000_000_000_000;
    // Implemented as a raw query to overcome TypeORM FROM clause requirement (adding a dummy table adds query planning overhead).
    // Current query is composed of an "aoi" CTE and subqueries wrapped in arrays in SELECT clauses
    const selectClauses: string[] = [];

    for (const baseTable of enabledRasterFilterTables) {
      const outputColumn = `#${baseTable}`; // Prefixing column name with "#" to detect it in the results
      const values = raster_filters?.[baseTable];
      const hasFilteringValues = values && values.length > 0;
      const table = selectOverviewTable(baseTable, aoiAreaM2);
      if (hasFilteringValues) {
        // Adding same input values
        selectClauses.push(`ARRAY[${values.join(',')}] as "${outputColumn}"`);
      } else {
        // Get all values from mappings
        let selectValues = `ARRAY(SELECT value::numeric FROM jsonb_each_text((SELECT mappings FROM raster_filters WHERE id = '${baseTable}')))`;
        if (calculateRealCoverage) {
          // Add a select column with all raster values intersecting the input geometry
          // Use ST_ValueCount to get distinct values as an array
          selectValues = `ARRAY(
            SELECT DISTINCT value
            FROM ${table} rr
            JOIN aoi ON ST_Intersects(rr.rast, aoi.geom)
            CROSS JOIN LATERAL ST_ValueCount(
              ST_Clip(rr.rast, aoi.geom, true),
              1
            ) AS vc(value, cnt)
        )`;
        }
        selectClauses.push(`${selectValues} as "${outputColumn}"`);
      }
    }
    const aoi_cte = `aoi AS MATERIALIZED (
          SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON($1), 'method=structure'), 3) AS geom
    )`;
    const sql = `
      WITH
      ${aoi_cte}
      SELECT ${selectClauses.join(', ')}
    `;
    await entityManager.query("SET LOCAL work_mem = '256MB';");
    const results = await entityManager.query(sql, [geomJson]);
    assert(results.length === 1, 'Expecting one raster coverage aggregated result row');

    return decodeRasterColumns(results[0]);
  };

  getVectorMask = async (entityManager: EntityManager, dataFilter: DataFilter): Promise<MultiPolygon> => {
    if (dataFilter.geometries.length === 0) {
      return { type: 'MultiPolygon', coordinates: [] };
    }

    const schema = process.env.POSTGRES_SCHEMA;
    const params: any[] = [];
    const p = (val: any) => {
      params.push(val);
      return `$${params.length}`;
    };

    const geomUnion = geometryUnion(dataFilter.geometries);
    const aoiAreaM2 = turf.area(dataFilter.geometries[0]!);
    const geomParam = p(JSON.stringify(geomUnion));

    const raster_filters = dataFilter.parameters.raster_filters;
    const enabledRasterFilterTables = await getEnabledRasterFilterTables();

    const ctes: string[] = [];
    const maskCteNames: string[] = [];

    ctes.push(`aoi AS MATERIALIZED (
      SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geomParam}), 'method=structure'), 3) AS geom
    )`);

    if (raster_filters) {
      for (const baseTable of enabledRasterFilterTables) {
        const values = raster_filters[baseTable];
        if (!values || values.length === 0) continue;

        const table = selectOverviewTable(baseTable, aoiAreaM2);
        const clippedRaster = `clipped_${table}`;
        const maskCte = `mask_${baseTable}`;

        ctes.push(`${clippedRaster} AS MATERIALIZED (
          SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) AS rast
          FROM ${schema}.${table} rr
          CROSS JOIN aoi
          WHERE ST_Intersects(rr.rast, aoi.geom)
        )`);

        ctes.push(`${maskCte} AS MATERIALIZED (
          SELECT ST_Union(dp.geom) AS geom
          FROM ${clippedRaster}
          CROSS JOIN LATERAL ST_DumpAsPolygons(${clippedRaster}.rast) dp
          WHERE dp.val = ANY(ARRAY[${values.join(',')}]::double precision[])
        )`);

        maskCteNames.push(maskCte);
      }
    }

    const resultExpr = maskCteNames.reduce((acc, maskCte) => `ST_Intersection(${acc}, ${maskCte}.geom)`, 'aoi.geom');

    const fromTables = ['aoi', ...maskCteNames].join(', ');
    const whereClause = maskCteNames.length > 0 ? `WHERE ${maskCteNames.map(m => `${m}.geom IS NOT NULL`).join(' AND ')}` : '';

    const sql = `
      WITH ${ctes.join(',\n      ')}
      SELECT ST_AsGeoJSON(
        ST_Multi(ST_CollectionExtract(ST_MakeValid(${resultExpr}, 'method=structure'), 3))
      )::json AS geom
      FROM ${fromTables}
      ${whereClause}
    `;

    await entityManager.query("SET LOCAL work_mem = '256MB';");
    const results = await entityManager.query(sql, params);
    if (results.length === 0 || results[0].geom === null) {
      return { type: 'MultiPolygon', coordinates: [] };
    }
    return results[0].geom as MultiPolygon;
  };
}

const geometryUnion = (geometries: (Polygon | MultiPolygon)[]): Polygon | MultiPolygon => {
  assert(geometries.length > 0, 'Do not call geometryUnion without input geometries');
  if (geometries.length === 1) {
    return geometries[0]!;
  }
  const features = geometries.map(geom => turf.feature(geom) as Feature<Polygon | MultiPolygon>);
  const featureCollection = turf.featureCollection(features);
  return turf.union(featureCollection)!.geometry;
};

const setCandidateFeatures = (query: any, geometries: (Polygon | MultiPolygon)[]) => {
  // Merge all input geometries and define candidate features by intersecting aoi
  const geom = JSON.stringify(geometryUnion(geometries));
  query.addCommonTableExpression(selectGeometry(), 'aoi', { materialized: true });
  query.setParameter('inputGeom', geom);
  query.addCommonTableExpression(
    `SELECT f.id, f.geom FROM ${process.env.POSTGRES_SCHEMA}.features f, aoi WHERE ST_Intersects(f.geom, aoi.geom)`,
    'candidate_features',
    { materialized: true },
  );
};

const joinMatchingFeatures = (query: any, geometries: (Polygon | MultiPolygon)[], rasterQuery: boolean = false) => {
  if (geometries.length === 0) {
    // Select all available features
    query.innerJoin('dataset_layers.feature', 'matching_features');
  } else if (rasterQuery) {
    query.innerJoin('matching_features', 'matching_features', 'matching_features.id = dataset_layers.feature_id');
  } else {
    // All candidate features can be included in the query
    query.innerJoin('candidate_features', 'matching_features', 'dataset_layers.feature_id = matching_features.id');
  }
};

const hasRasterFilters = (dataFilter: DataFilter): boolean => {
  const raster_filters: Record<string, number[]> | undefined = dataFilter.parameters.raster_filters;
  return Boolean(raster_filters && Object.keys(raster_filters).length > 0);
};

const applyFiltersToQuery = async (query: any, dataFilter: DataFilter, enabledRasterFilterTables: string[]) => {
  if (dataFilter.geometries.length > 0) {
    // Testing intersection with entire dataset
    query.innerJoin('dataset_layers.dataset', 'ds', 'ds.spatial_extent && (SELECT geom FROM aoi)'); // Checking bbox only with "&&" without CTE cross-join
  } else {
    query.innerJoin('dataset_layers.dataset', 'ds');
  }

  const filters = dataFilter.parameters;

  if (filters.data_types && filters.data_types.length > 0) {
    query.andWhere('ds.gis_datatype IN (:...data_types)', { data_types: filters.data_types });
  }
  // Should date filters be like the the depth one (overlapping with min/max interval)
  // There is a case where we might have reference period start and stop but no sampling_dates in the layers, we should fall back on the dataset info
  if (filters.min_sampling_date === null) {
    query.andWhere('layer.sampling_date IS NULL');
  } else if (filters.min_sampling_date) {
    // We just need dataset to overlap with input interval
    query.andWhere('ds.reference_period_stop >= :min_sampling_date', { min_sampling_date: filters.min_sampling_date });
    // Filtering actual layers
    query.andWhere('layer.sampling_date >= :min_sampling_date', {
      min_sampling_date: filters.min_sampling_date,
    });
  }
  if (filters.max_sampling_date === null) {
    query.andWhere('layer.sampling_date IS NULL');
  } else if (filters.max_sampling_date) {
    // We just need dataset to overlap with input interval
    query.andWhere('ds.reference_period_start <= :max_sampling_date', { max_sampling_date: filters.max_sampling_date });
    // Filtering actual layers
    query.andWhere('layer.sampling_date <= :max_sampling_date', {
      max_sampling_date: filters.max_sampling_date,
    });
  }
  if (filters.min_depth === null) {
    query.andWhere('layer.min_depth IS NULL');
  } else if (filters.min_depth !== undefined) {
    // We just need dataset to overlap with input interval
    query.andWhere("(ds.soil_depth->>'max')::int >= :min_depth", { min_depth: filters.min_depth });
    // Filtering actual layers
    query.andWhere('layer.max_depth >= :min_depth', { min_depth: filters.min_depth });
  }
  if (filters.max_depth === null) {
    query.andWhere('layer.max_depth IS NULL');
  } else if (filters.max_depth !== undefined) {
    // We just need dataset to overlap with input interval
    query.andWhere("(ds.soil_depth->>'min')::int <= :max_depth", { max_depth: filters.max_depth });
    // Filtering actual layers
    query.andWhere('layer.min_depth <= :max_depth', { max_depth: filters.max_depth });
  }
  if (filters.horizons && filters.horizons.length > 0) {
    const nullQuery = filters.horizons.includes(null) ? 'OR layer.horizon IS NULL' : '';
    query.andWhere(`layer.horizon IN (:...horizons) ${nullQuery}`, { horizons: filters.horizons });
  }

  const rasterQuery = hasRasterFilters(dataFilter) && enabledRasterFilterTables.length > 0;
  joinMatchingFeatures(query, dataFilter.geometries, rasterQuery);

  return query;
};

const applyFiltersToExternalQuery = (query: any, dataFilter: DataFilter, rasterFilterTables: string[]) => {
  const filters = dataFilter.parameters;
  if (filters.soil_properties && filters.soil_properties.length > 0) {
    query.andWhere('soil_property.slug IN (:...soil_properties)', { soil_properties: filters.soil_properties });
  }
  if (filters.licenses && filters.licenses.length > 0) {
    // Each dataset can have multiple licenses, need to check that at least one matches
    // TODO: consider querying dataset.licenses
    query.andWhere('license.slug IN (:...licenses)', { licenses: filters.licenses });
  }
  applyRasterFilterToQuery(query, dataFilter, rasterFilterTables);
  return query;
};

const getEnabledRasterFilterTables = async () => {
  const dataSource = await getDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  const enabledFilters = await rasterFilterService.getEnabledRasterFilters({ entityManager: queryRunner.manager, entitlements: {} });
  const rasterFilterTables = enabledFilters.map(f => f.id);
  await queryRunner.release();
  return rasterFilterTables;
};

const applyRasterFilterToQuery = (
  query: SelectQueryBuilder<DatasetLayerEntity>,
  dataFilter: DataFilter,
  enabledRasterFilterTables: string[],
) => {
  if (dataFilter.geometries.length === 0) {
    // No input geometry, raster filtering cannot be applied
    return;
  }
  setCandidateFeatures(query, dataFilter.geometries);

  if (!hasRasterFilters(dataFilter) || enabledRasterFilterTables.length === 0) {
    // Nothing to do
    return;
  }

  const raster_filters: Record<string, number[]> | undefined = dataFilter.parameters.raster_filters;
  const aoiAreaM2 = turf.area(dataFilter.geometries[0]!);
  let joinTables = '';
  const whereClauses: string[] = [];

  for (const baseTable of enabledRasterFilterTables) {
    const values = raster_filters?.[baseTable];
    const hasFilteringValues = values && values.length > 0;
    const table = selectOverviewTable(baseTable, aoiAreaM2);
    const clippedRaster = `clipped_${table}`;
    if (hasFilteringValues) {
      query.addCommonTableExpression(
        `
        SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) as rast FROM ${process.env.POSTGRES_SCHEMA}.${table} rr
        CROSS JOIN aoi
        WHERE ST_Intersects(rr.rast, aoi.geom)`,
        clippedRaster,
        { materialized: true },
      );
      joinTables += ` CROSS JOIN ${clippedRaster} ${clippedRaster}`;
      whereClauses.push(`(
        ST_GeometryType(cf.geom) = 'ST_Point'
        AND ST_Value(${clippedRaster}.rast, cf.geom, TRUE)=ANY(ARRAY[${values.join(',')}]::double precision[])
      )
      OR (
        ST_GeometryType(cf.geom) = ANY('{ST_Polygon,ST_MultiPolygon}')
        AND (
            SELECT SUM(cnt)
            FROM ST_ValueCount(
                ST_Clip(${clippedRaster}.rast, 1, cf.geom, touched => true),
                1,
                ARRAY[${values.join(',')}]::double precision[]
            ) AS vc(value, cnt)
        ) > 0
      )`);
    }
  }

  query.addCommonTableExpression(
    `
    SELECT cf.id, cf.geom
    FROM candidate_features cf
      ${joinTables}
    WHERE ${whereClauses.join(' OR ')}
    `,
    'matching_features',
    { materialized: true },
  );
};

const decodeRasterColumns = (row: any): any => {
  const output = new Map<string, number[]>();
  for (const key of Object.keys(row)) {
    if (!key.startsWith('#')) {
      continue;
    }
    const table = key.substring(1);
    output.set(table, row[key]);
  }
  return Object.fromEntries(output);
};

const dataRowTranslation = (row: any, sort?: string): SoilDataSample => {
  const output = {
    id: row.id,
    dataset_id: row.dataset_slug,
    dataset_name: row.dataset_name,
    soil_property: row.soil_property,
    property_acronym: row.property_acronym,
    property_name: row.property_name,
    standard_unit: row.standard_unit,
    value: parseFloat(row.value),
    geometry: row.geometry,
    license_name: row.license_name,
    sampling_date: row.sampling_date,
    min_depth: row.min_depth !== null ? parseFloat(row.min_depth) : null,
    max_depth: row.max_depth !== null ? parseFloat(row.max_depth) : null,
    // TODO: to be restored | horizon: row.horizon,
    sample_pretreatment: row.sample_pretreatment,
    technique: row.technique,
    laboratory_method: row.laboratory_method,
    extractant_concentration: row.extractant_concentration,
    extraction_ratio: row.extraction_ratio,
    extraction_base: row.extraction_base,
    measurement_procedure: row.measurement_procedure,
    limit_of_detection: row.limit_of_detection,
  };

  // Create and encode a cursor containing current row sorting value
  const cursor = encodeCursor(createCursor(row.id, sort, sort ? output[sort.replace('-', '')] : undefined));

  return { ...output, cursor };
};

export const buildDatasetFilterClauses = (
  filters: FilterCriteria,
  p: (val: any) => string,
  schema: string,
): { outerWhere: string[]; lateralJoins: string[]; lateralWhere: string[] } => {
  const outerWhere: string[] = ['ds.deleted_at IS NULL', `ds.spatial_extent && (SELECT geom FROM aoi)`];
  const lateralJoins: string[] = [];
  const lateralWhere: string[] = [`ST_Intersects(f.geom, (SELECT geom FROM aoi))`];
  let needsLayerJoin = false;

  if (filters.data_types && filters.data_types.length > 0) {
    outerWhere.push(`ds.gis_datatype IN (${filters.data_types.map(v => p(v)).join(', ')})`);
  }

  if (filters.min_sampling_date === null) {
    lateralWhere.push('layer.sampling_date IS NULL');
    needsLayerJoin = true;
  } else if (filters.min_sampling_date) {
    outerWhere.push(`ds.reference_period_stop >= ${p(filters.min_sampling_date)}`);
    lateralWhere.push(`layer.sampling_date >= ${p(filters.min_sampling_date)}`);
    needsLayerJoin = true;
  }

  if (filters.max_sampling_date === null) {
    lateralWhere.push('layer.sampling_date IS NULL');
    needsLayerJoin = true;
  } else if (filters.max_sampling_date) {
    outerWhere.push(`ds.reference_period_start <= ${p(filters.max_sampling_date)}`);
    lateralWhere.push(`layer.sampling_date <= ${p(filters.max_sampling_date)}`);
    needsLayerJoin = true;
  }

  if (filters.min_depth === null) {
    lateralWhere.push('layer.min_depth IS NULL');
    needsLayerJoin = true;
  } else if (filters.min_depth !== undefined) {
    outerWhere.push(`(ds.soil_depth->>'max')::int >= ${p(filters.min_depth)}`);
    lateralWhere.push(`layer.max_depth >= ${p(filters.min_depth)}`);
    needsLayerJoin = true;
  }

  if (filters.max_depth === null) {
    lateralWhere.push('layer.max_depth IS NULL');
    needsLayerJoin = true;
  } else if (filters.max_depth !== undefined) {
    outerWhere.push(`(ds.soil_depth->>'min')::int <= ${p(filters.max_depth)}`);
    lateralWhere.push(`layer.min_depth <= ${p(filters.max_depth)}`);
    needsLayerJoin = true;
  }

  if (filters.horizons && filters.horizons.length > 0) {
    const nonNull = filters.horizons.filter(h => h !== null);
    const nullClause = filters.horizons.includes(null) ? ' OR layer.horizon IS NULL' : '';
    lateralWhere.push(
      nonNull.length > 0 ? `(layer.horizon IN (${nonNull.map(h => p(h)).join(', ')})${nullClause})` : 'layer.horizon IS NULL',
    );
    needsLayerJoin = true;
  }

  if (filters.soil_properties && filters.soil_properties.length > 0) {
    lateralJoins.push(`INNER JOIN ${schema}.soil_properties sp ON sp.id = dl.soil_property_id AND sp.deleted_at IS NULL`);
    lateralWhere.push(`sp.slug IN (${filters.soil_properties.map(v => p(v)).join(', ')})`);
  }

  if (filters.licenses && filters.licenses.length > 0) {
    needsLayerJoin = true;
    lateralJoins.push(`LEFT JOIN ${schema}.licenses lic ON lic.id = layer.license AND lic.deleted_at IS NULL`);
    lateralWhere.push(`lic.slug IN (${filters.licenses.map(v => p(v)).join(', ')})`);
  }

  // Layer join must come first since license joins through it
  if (needsLayerJoin) {
    lateralJoins.unshift(`INNER JOIN ${schema}.layers layer ON layer.id = dl.layer_id`);
  }

  return { outerWhere, lateralJoins, lateralWhere };
};

/**
 * Builds raster filter CTEs for raw SQL queries: aoi_subdivided (for large geometries),
 * candidate_features, clipped raster CTEs, and matching_features.
 *
 * Used by both filterDatasets (LATERAL pattern) and buildRawSoilQuery (CTE join pattern).
 * Returns { ctes, usesMatchingFeatures } where ctes is a comma-joined string ready to
 * insert after the aoi CTE. When usesMatchingFeatures is false, ctes is empty and the
 * caller handles its own spatial CTEs.
 */
const buildRasterSql = (dataFilter: DataFilter, enabledRasterFilterTables: string[]): { ctes: string; usesMatchingFeatures: boolean } => {
  if (dataFilter.geometries.length === 0 || !hasRasterFilters(dataFilter) || enabledRasterFilterTables.length === 0) {
    return { ctes: '', usesMatchingFeatures: false };
  }

  const schema = process.env.POSTGRES_SCHEMA;
  const raster_filters = dataFilter.parameters.raster_filters!;
  const aoiAreaM2 = turf.area(dataFilter.geometries[0]!);
  const clippedRasterCtes: string[] = [];
  const joinTables: string[] = [];
  const whereClauses: string[] = [];

  for (const baseTable of enabledRasterFilterTables) {
    const values = raster_filters[baseTable];
    if (!values || values.length === 0) continue;

    const table = selectOverviewTable(baseTable, aoiAreaM2);
    const clippedRaster = `clipped_${table}`;

    clippedRasterCtes.push(`${clippedRaster} AS MATERIALIZED (
      SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) AS rast
      FROM ${schema}.${table} rr
      CROSS JOIN aoi
      WHERE ST_Intersects(rr.rast, aoi.geom)
    )`);

    joinTables.push(`CROSS JOIN ${clippedRaster}`);
    whereClauses.push(`(
      (ST_GeometryType(cf.geom) = 'ST_Point'
        AND ST_Value(${clippedRaster}.rast, cf.geom, TRUE) = ANY(ARRAY[${values.join(',')}]::double precision[]))
      OR (ST_GeometryType(cf.geom) = ANY('{ST_Polygon,ST_MultiPolygon}')
        AND (SELECT SUM(cnt) FROM ST_ValueCount(
          ST_Clip(${clippedRaster}.rast, 1, cf.geom, touched => true), 1,
          ARRAY[${values.join(',')}]::double precision[]
        ) AS vc(value, cnt)) > 0)
    )`);
  }

  if (whereClauses.length === 0) {
    return { ctes: '', usesMatchingFeatures: false };
  }

  const useSubdivide = aoiAreaM2 > AREA_THRESHOLD_M2;
  const spatialSource = useSubdivide ? 'aoi_subdivided' : 'aoi';

  const allCtes: string[] = [];

  if (useSubdivide) {
    allCtes.push(`aoi_subdivided AS MATERIALIZED (
      SELECT ST_Subdivide(aoi.geom, 64) AS geom FROM aoi
    )`);
  }

  allCtes.push(`candidate_features AS MATERIALIZED (
    SELECT DISTINCT f.id, f.geom
    FROM ${schema}.features f
    JOIN ${spatialSource} ON ST_Intersects(f.geom, ${spatialSource}.geom)
  )`);

  allCtes.push(...clippedRasterCtes);

  allCtes.push(`matching_features AS MATERIALIZED (
    SELECT cf.id, cf.geom
    FROM candidate_features cf
    ${joinTables.join('\n    ')}
    WHERE ${whereClauses.join('\n      OR ')}
  )`);

  return { ctes: allCtes.join(',\n    '), usesMatchingFeatures: true };
};

/**
 * Builds a raw parameterised SQL query for soil data retrieval or counting.
 *
 * Drives the join order as:
 *   datasets (slug filter, 1 row)
 *   → dataset_layers  (index on dataset_id)
 *   → candidate_features (spatial index on features)
 *   → observations  (index on dataset_layer_id)
 *
 * This avoids the full seq-scans that TypeORM's query-builder plan produces
 * when it anchors from `dataset_layers` and hash-joins everything bottom-up.
 */
const buildRawSoilQuery = (
  dataFilter: DataFilter,
  datasetSlugs: string[],
  options: {
    mode: 'count' | 'data';
    limit?: number | undefined;
    cursor?: string | undefined;
    sort?: string | undefined;
    enabledRasterFilterTables?: string[] | undefined;
  },
): { sql: string; params: any[] } => {
  const schema = process.env.POSTGRES_SCHEMA;
  const params: any[] = [];
  const p = (val: any) => {
    params.push(val);
    return `$${params.length}`;
  };

  // ── geometry / AOI ──────────────────────────────────────────────────────────
  const hasGeometry = dataFilter.geometries.length > 0;
  const geomJson = hasGeometry ? JSON.stringify(geometryUnion(dataFilter.geometries)) : null;

  // ── slug placeholders ────────────────────────────────────────────────────────
  const slugPlaceholders = datasetSlugs.map(s => p(s)).join(', ');

  // ── filter conditions ────────────────────────────────────────────────────────
  const filters = dataFilter.parameters;
  const whereClauses: string[] = [];

  if (filters.data_types && filters.data_types.length > 0) {
    const dtPlaceholders = filters.data_types.map((v: string) => p(v)).join(', ');
    whereClauses.push(`ds.gis_datatype IN (${dtPlaceholders})`);
  }
  if (filters.min_sampling_date === null) {
    whereClauses.push('layer.sampling_date IS NULL');
  } else if (filters.min_sampling_date) {
    whereClauses.push(`ds.reference_period_stop >= ${p(filters.min_sampling_date)}`);
    whereClauses.push(`layer.sampling_date >= ${p(filters.min_sampling_date)}`);
  }
  if (filters.max_sampling_date === null) {
    whereClauses.push('layer.sampling_date IS NULL');
  } else if (filters.max_sampling_date) {
    whereClauses.push(`ds.reference_period_start <= ${p(filters.max_sampling_date)}`);
    whereClauses.push(`layer.sampling_date <= ${p(filters.max_sampling_date)}`);
  }
  if (filters.min_depth === null) {
    whereClauses.push('layer.min_depth IS NULL');
  } else if (filters.min_depth !== undefined) {
    whereClauses.push(`(ds.soil_depth->>'max')::int >= ${p(filters.min_depth)}`);
    whereClauses.push(`layer.max_depth >= ${p(filters.min_depth)}`);
  }
  if (filters.max_depth === null) {
    whereClauses.push('layer.max_depth IS NULL');
  } else if (filters.max_depth !== undefined) {
    whereClauses.push(`(ds.soil_depth->>'min')::int <= ${p(filters.max_depth)}`);
    whereClauses.push(`layer.min_depth <= ${p(filters.max_depth)}`);
  }
  if (filters.horizons && filters.horizons.length > 0) {
    const nonNull = filters.horizons.filter((h: any) => h !== null);
    const hPlaceholders = nonNull.map((h: string | null) => p(h)).join(', ');
    const nullClause = filters.horizons.includes(null) ? ' OR layer.horizon IS NULL' : '';
    if (nonNull.length > 0) {
      whereClauses.push(`(layer.horizon IN (${hPlaceholders})${nullClause})`);
    } else {
      whereClauses.push('layer.horizon IS NULL');
    }
  }
  if (filters.soil_properties && filters.soil_properties.length > 0) {
    const spPlaceholders = filters.soil_properties.map((v: string) => p(v)).join(', ');
    whereClauses.push(`soil_property.slug IN (${spPlaceholders})`);
  }
  if (filters.licenses && filters.licenses.length > 0) {
    const lPlaceholders = filters.licenses.map((v: string) => p(v)).join(', ');
    whereClauses.push(`license.slug IN (${lPlaceholders})`);
  }

  const whereClause = whereClauses.length > 0 ? `AND ${whereClauses.join('\n  AND ')}` : '';

  // ── spatial + raster CTEs ────────────────────────────────────────────────────
  const geomParam = hasGeometry ? p(geomJson) : null;
  const aoi_cte = hasGeometry
    ? `aoi AS MATERIALIZED (
        SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geomParam}), 'method=structure'), 3) AS geom
      ),`
    : '';

  const aoiArea = hasGeometry ? turf.area(dataFilter.geometries[0]!) : 0;

  const enabledRasterFilterTables = options.enabledRasterFilterTables ?? [];
  const { ctes: rasterCtes, usesMatchingFeatures } = buildRasterSql(dataFilter, enabledRasterFilterTables);

  // When buildRasterSql produced matching_features it also generated aoi_subdivided +
  // candidate_features internally — skip generating them here to avoid duplicate CTEs.
  const spatialSource = hasGeometry && aoiArea > AREA_THRESHOLD_M2 ? 'aoi_subdivided' : 'aoi';

  const aoi_subdivided_cte =
    !usesMatchingFeatures && hasGeometry && aoiArea > AREA_THRESHOLD_M2
      ? `aoi_subdivided AS MATERIALIZED (
        SELECT ST_Subdivide(aoi.geom, 64) AS geom
        FROM aoi
      ),`
      : '';

  const candidate_features_cte =
    !usesMatchingFeatures && hasGeometry
      ? `candidate_features AS MATERIALIZED (
        SELECT distinct f.id, f.geom
        FROM ${schema}.features f
        JOIN ${spatialSource} ON ST_Intersects(f.geom, ${spatialSource}.geom)
      ),`
      : '';

  const featureSourceCte = usesMatchingFeatures ? 'matching_features' : 'candidate_features';
  const featureJoin = hasGeometry
    ? `INNER JOIN ${featureSourceCte} matching_features ON matching_features.id = dl.feature_id`
    : `INNER JOIN ${schema}.features matching_features ON matching_features.id = dl.feature_id`;

  const datasetSpatialFilter = hasGeometry ? `AND ds.spatial_extent && (SELECT geom FROM aoi)` : '';

  // ── cursor / sort (data mode only) ──────────────────────────────────────────
  let cursorClause = '';
  let orderClause = 'ORDER BY obs.id ASC';

  if (options.mode === 'data') {
    const sort = options.sort;
    const sortFieldMapping: Record<string, string> = {
      id: 'obs.id',
      value: 'obs.value',
      dataset_id: 'ds.slug',
      dataset_name: 'ds.name',
      soil_property: 'soil_property.slug',
      property_acronym: 'soil_property.property_acronym',
      standard_unit: 'soil_property.standard_unit',
      geometry: 'dl.feature_geom',
      license_name: 'license.name',
      sampling_date: 'layer.sampling_date',
      min_depth: 'layer.min_depth',
      max_depth: 'layer.max_depth',
      horizon: 'layer.horizon',
      sample_pretreatment: 'pv1.name',
      technique: 'procedure.technique',
      laboratory_method: 'pv2.name',
      extractant_concentration: 'pv3.name',
      extraction_ratio: 'pv4.name',
      extraction_base: 'pv5.name',
      measurement_procedure: 'pv6.name',
      limit_of_detection: 'pv7.name',
    };

    if (sort) {
      const isDesc = sort.startsWith('-');
      const sortKey = isDesc ? sort.substring(1) : sort;
      const qualifiedColumn = sortFieldMapping[sortKey];
      if (!qualifiedColumn) throw new ErrorResponse(`Unknown sort field: ${sortKey}`, StatusCodes.BAD_REQUEST);
      const dir = isDesc ? 'DESC' : 'ASC';
      orderClause = `ORDER BY ${qualifiedColumn} ${dir}, obs.id ${dir}`;
    }

    if (options.cursor) {
      const cursor = decodeCursor(options.cursor);
      if (sort && cursor.column !== sort) {
        throw new ErrorResponse(`Sort field is not matching cursor: ${sort} != ${cursor.column}`, StatusCodes.BAD_REQUEST);
      }
      if (cursor.column && cursor.value) {
        const isDesc = cursor.column.startsWith('-');
        const sortKey = isDesc ? cursor.column.substring(1) : cursor.column;
        const qualifiedColumn = sortFieldMapping[sortKey];
        const operator = isDesc ? '<' : '>';
        cursorClause = `AND (${qualifiedColumn}, obs.id) ${operator} (${p(cursor.value)}, ${p(cursor.id)})`;
      } else {
        cursorClause = `AND obs.id > ${p(cursor.id)}`;
      }
    }
  }

  // ── SELECT columns ───────────────────────────────────────────────────────────
  const selectColumns =
    options.mode === 'count'
      ? 'COUNT(*) AS count'
      : `obs.id,
      ds.slug AS dataset_slug,
      ds.name AS dataset_name,
      soil_property.slug AS soil_property,
      soil_property.property_acronym,
      soil_property.property_name,
      soil_property.standard_unit,
      obs.value,
      ST_AsGeoJSON(dl.feature_geom)::json AS geometry,
      COALESCE(license.name, license_fallback.name) AS license_name,
      layer.sampling_date,
      layer.min_depth,
      layer.max_depth,
      layer.horizon,
      pv1.name AS sample_pretreatment,
      procedure.technique,
      pv2.name AS laboratory_method,
      pv3.name AS extractant_concentration,
      pv4.name AS extraction_ratio,
      pv5.name AS extraction_base,
      pv6.name AS measurement_procedure,
      pv7.name AS limit_of_detection`;

  const limitClause = options.mode === 'data' && options.limit ? `LIMIT ${parseInt(String(options.limit), 10)}` : '';
  if (options.mode === 'count') orderClause = '';

  const sql = `
    WITH
    ${aoi_cte}
    ${usesMatchingFeatures ? `${rasterCtes},` : `${aoi_subdivided_cte}${candidate_features_cte}`}
    -- Resolve slug(s) to dataset id(s) first — drives the join order
    target_dataset AS MATERIALIZED (
      SELECT ds.id
      FROM ${schema}.datasets ds
      WHERE ds.slug IN (${slugPlaceholders})
        AND ds.deleted_at IS NULL
        ${datasetSpatialFilter}
    ),
    -- Narrow dataset_layers using index on dataset_id before touching observations
    target_layers AS MATERIALIZED (
      SELECT dl.*, matching_features.geom AS feature_geom
      FROM ${schema}.dataset_layers dl
      INNER JOIN target_dataset td ON td.id = dl.dataset_id
      ${featureJoin}
    )
    SELECT ${selectColumns}
    FROM target_layers dl
    INNER JOIN ${schema}.datasets ds ON ds.id = dl.dataset_id
    INNER JOIN ${schema}.observations obs ON obs.dataset_layer_id = dl.id
    LEFT JOIN ${schema}.layers layer ON layer.id = dl.layer_id
    LEFT JOIN ${schema}.soil_properties soil_property ON soil_property.id = dl.soil_property_id AND soil_property.deleted_at IS NULL
    LEFT JOIN ${schema}.licenses license ON license.id = layer.license AND license.deleted_at IS NULL
    LEFT JOIN ${schema}.licenses license_fallback ON license_fallback.slug = ds.licenses[1]
    LEFT JOIN ${schema}.procedures procedure ON procedure.id = obs.procedure_id AND procedure.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv1 ON pv1.id = procedure.sample_pretreatment_id AND pv1.category = 'sample_pretreatment' AND pv1.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv2 ON pv2.id = procedure.laboratory_method_id AND pv2.category = 'laboratory_method' AND pv2.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv3 ON pv3.id = procedure.extractant_concentration_id AND pv3.category = 'extractant_concentration' AND pv3.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv4 ON pv4.id = procedure.extraction_ratio_id AND pv4.category = 'extraction_ratio' AND pv4.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv5 ON pv5.id = procedure.extraction_base_id AND pv5.category = 'extraction_base' AND pv5.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv6 ON pv6.id = procedure.measurement_procedure_id AND pv6.category = 'measurement_procedure' AND pv6.deleted_at IS NULL
    LEFT JOIN ${schema}.vocabulary pv7 ON pv7.id = procedure.limit_of_detection_id AND pv7.category = 'limit_of_detection' AND pv7.deleted_at IS NULL
    WHERE ds.slug IN (${slugPlaceholders})
      ${whereClause}
      ${cursorClause}
    ${orderClause}
    ${limitClause}
  `;

  return { sql, params };
};

const selectGeometry = (): string => {
  return "SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(:inputGeom), 'method=structure'), 3) AS geom";
};

const joinProcedures = (query: any) => {
  query
    .leftJoin('vocabulary', 'pv1', "pv1.id = procedure.sample_pretreatment_id AND pv1.category = 'sample_pretreatment'")
    .leftJoin('vocabulary', 'pv2', "pv2.id = procedure.laboratory_method_id AND pv2.category = 'laboratory_method'")
    .leftJoin('vocabulary', 'pv3', "pv3.id = procedure.extractant_concentration_id AND pv3.category = 'extractant_concentration'")
    .leftJoin('vocabulary', 'pv4', "pv4.id = procedure.extraction_ratio_id AND pv4.category = 'extraction_ratio'")
    .leftJoin('vocabulary', 'pv5', "pv5.id = procedure.extraction_base_id AND pv5.category = 'extraction_base'")
    .leftJoin('vocabulary', 'pv6', "pv6.id = procedure.measurement_procedure_id AND pv6.category = 'measurement_procedure'")
    .leftJoin('vocabulary', 'pv7', "pv7.id = procedure.limit_of_detection_id AND pv7.category = 'limit_of_detection'");
};
