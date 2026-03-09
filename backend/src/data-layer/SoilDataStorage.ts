import * as turf from '@turf/turf';
import { Polygon, MultiPolygon, Feature } from 'geojson';
import { OverlapType } from '../types/enums';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { FilteredDataset, FilterCriteria, DataFilter } from '../interfaces/DatasetFilter';
import DatasetEntity from '../entities/Dataset';
import DatasetLayerEntity from '../entities/DatasetLayer';
import { SoilDataSample } from '../interfaces/SoilDataSample';
import assert from 'assert';
import { createCursor, decodeCursor, encodeCursor } from '../utils/cursor';
import { Cursor } from '../interfaces/Cursor';
import { ErrorResponse } from '../utils/error';
import { StatusCodes } from 'http-status-codes';
import RasterFilterService from '../services/RasterFilterService';
import { getDataSource } from '../utils/data-source';
import { selectOverviewTable } from '../utils/raster';

export default class SoilDataStorage {
  /**
   * @returns A map of dataset UUIDs to their overlap type with the provided geometry
   */
  getOverlapType = async (entityManager: EntityManager, geometry: Polygon | MultiPolygon): Promise<Map<string, OverlapType>> => {
    const repo = entityManager.getRepository(DatasetEntity);
    const results = await repo
      .createQueryBuilder('datasets')
      .addCommonTableExpression('SELECT ST_GeomFromGeoJSON(:input) as geom', 'input')
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
      .setParameter('input', JSON.stringify(geometry))
      .getRawMany();
    return new Map(results.map(row => [row.dataset_id, row.overlap_type as OverlapType]));
  };

  filter = async (entityManager: EntityManager, geometry: Polygon | MultiPolygon, filters: FilterCriteria): Promise<FilteredDataset[]> => {
    await entityManager.query("SET LOCAL work_mem = '256MB';");
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = await repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.layer', 'layer')
      .leftJoin('dataset_layers.soil_property', 'soil_property')
      .leftJoin('licenses', 'license', 'license.deleted_at IS NULL AND license.id = layer.license')
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('ds.gis_datatype', 'gis_datatype')
      .addSelect('ds.name', 'dataset_name')
      .addSelect('ds.slug', 'dataset_slug')
      .addSelect("STRING_AGG(DISTINCT license.slug, ',')", 'licenses')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .addSelect('MIN(layer.sampling_date::text)', 'min_sampling_date')
      .addSelect('MAX(layer.sampling_date::text)', 'max_sampling_date')
      .addSelect('MIN(layer.min_depth)', 'min_depth')
      .addSelect('MAX(layer.max_depth)', 'max_depth')
      .addSelect("STRING_AGG(DISTINCT layer.horizon, ',')", 'horizons')
      .addSelect("STRING_AGG(DISTINCT soil_property.slug, ',')", 'soil_properties')
      .groupBy('dataset_layers.dataset_id, ds.name, ds.slug, ds.gis_datatype');

    const dataFilter = { geometries: [geometry], parameters: filters };
    const enabledRasterFilterTables = await getEnabledRasterFilterTables();
    await applyFiltersToQuery(query, dataFilter, enabledRasterFilterTables);
    await addRasterCoverage(query, dataFilter, enabledRasterFilterTables);
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
      // TODO: to be restored | horizons: row.horizons ? row.horizons.split(',') : [],
      soil_properties: row.soil_properties ? row.soil_properties.split(',') : [],
      raster_filters: decodeRasterColumns(row),
      dataset_layer_count: parseInt(row.dataset_layer_count),
    }));
  };

  getSoilData = async (
    entityManager: EntityManager,
    dataFilter: DataFilter,
    datasetSlugs: string[],
    limit: number,
    cursor?: string,
    sort?: string,
  ): Promise<SoilDataSample[]> => {
    const query = await this.buildSoilBaseQuery(entityManager, dataFilter, datasetSlugs);

    applySelectToQuery(query);
    applyCursorToQuery(query, cursor, sort);
    applySortingToQuery(query, sort);

    query.limit(limit);

    const results = await query.getRawMany();

    return results.map(row => dataRowTranslation(row, sort));
  };

  getSoilDataCount = async (entityManager: EntityManager, dataFilter: DataFilter, datasetSlugs: string[]): Promise<number> => {
    const query = await this.buildSoilBaseQuery(entityManager, dataFilter, datasetSlugs);

    // otherwise typeorm count by distinct("dataset_layers"."id"
    const result = await query.select('COUNT(*)', 'count').getRawOne();

    return parseInt(result.count, 10);
  };

  buildSoilBaseQuery = async (
    entityManager: EntityManager,
    dataFilter: DataFilter,
    datasetSlugs: string[],
  ): Promise<SelectQueryBuilder<DatasetLayerEntity>> => {
    assert(datasetSlugs.length > 0, 'At least one dataset slug must be provided');
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.layer', 'layer')
      .leftJoin('dataset_layers.soil_property', 'soil_property')
      .leftJoin('layer.license_obj', 'license')
      .innerJoin('observations', 'obs', 'obs.dataset_layer_id = dataset_layers.id')
      .leftJoin('obs.procedure', 'procedure')
      .where('ds.slug IN (:...datasetSlugs)', { datasetSlugs });

    await applyFiltersToQuery(query, dataFilter);

    return query;
  };
}

const applySelectToQuery = (query: any) => {
  query
    .select('obs.id', 'id')
    .addSelect('ds.slug', 'dataset_slug')
    .addSelect('ds.name', 'dataset_name')
    .addSelect('soil_property.slug', 'soil_property')
    .addSelect('soil_property.property_acronym', 'property_acronym')
    .addSelect('soil_property.standard_unit', 'standard_unit')
    .addSelect('obs.value', 'value')
    .addSelect('ST_AsGeoJSON(matching_features.geom)::json', 'geometry')
    .addSelect('COALESCE(license.name, ds.licenses[1])', 'license_name')
    .addSelect('layer.sampling_date::text', 'sampling_date')
    .addSelect('layer.min_depth', 'min_depth')
    .addSelect('layer.max_depth', 'max_depth')
    .addSelect('layer.horizon', 'horizon')
    .addSelect('procedure.sample_pretreatment', 'sample_pretreatment')
    .addSelect('procedure.technique', 'technique')
    .addSelect('procedure.laboratory_method', 'laboratory_method')
    .addSelect('procedure.extractant_concentration', 'extractant_concentration')
    .addSelect('procedure.extraction_ratio', 'extraction_ratio')
    .addSelect('procedure.extraction_base', 'extraction_base')
    .addSelect('procedure.measurement_procedure', 'measurement_procedure')
    .addSelect('procedure.limit_of_detection', 'limit_of_detection');
};

const geometryUnion = (geometries: (Polygon | MultiPolygon)[]): Polygon | MultiPolygon => {
  assert(geometries.length > 0, 'Do not call geometryUnion without input geometries');
  if (geometries.length === 1) {
    return geometries[0]!;
  }
  const features = geometries.map(geom => turf.feature(geom) as Feature<Polygon | MultiPolygon>);
  const featureCollection = turf.featureCollection(features);
  return turf.union(featureCollection)!.geometry;
};

const setMatchingFeatures = (query: any, dataFilter: DataFilter) => {
  if (dataFilter.geometries.length === 0) {
    // Select all available features
    query.innerJoin('dataset_layers.feature', 'matching_features');
    return;
  }

  // Merge all input geometries and define candidate features by intersecting aoi
  const geom = JSON.stringify(geometryUnion(dataFilter.geometries));
  query.addCommonTableExpression('SELECT ST_GeomFromGeoJSON(:inputGeom) AS geom', 'aoi', { materialized: true });
  query.setParameter('inputGeom', geom);
  query.addCommonTableExpression(
    `SELECT f.id, f.geom, geometrytype(f.geom) AS geom_type FROM ${process.env.POSTGRES_SCHEMA}.features f, aoi WHERE ST_Intersects(f.geom, aoi.geom)`,
    'candidate_features',
    { materialized: true },
  );

  if (hasRasterFilters(dataFilter)) {
    // Filtering by raster values needs a different approach, see applyRasterFilterToQuery
    return;
  }

  // All candidate features can be included in the query
  query.innerJoin('candidate_features', 'matching_features', 'dataset_layers.feature_id = matching_features.id');
};

const hasRasterFilters = (dataFilter: DataFilter): boolean => {
  const raster_filters: Record<string, number[]> | undefined = dataFilter.parameters.raster_filters;
  return Boolean(raster_filters && Object.keys(raster_filters).length > 0);
};

const applyFiltersToQuery = async (query: any, dataFilter: DataFilter, rasterFilterTables?: string[]) => {
  setMatchingFeatures(query, dataFilter);

  let datasetJoinCondition = 'ds.id = dataset_layers.dataset_id';
  if (dataFilter.geometries.length > 0) {
    // Testing intersection with entire dataset
    datasetJoinCondition += ' AND ds.spatial_extent && (SELECT geom FROM aoi)'; // Checking bbox only with "&&" without CTE cross-join
  }

  query.innerJoin('dataset_layers.dataset', 'ds', datasetJoinCondition);

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
    query.andWhere("TO_CHAR(layer.sampling_date, 'YYYY-MM-DD') >= :min_sampling_date", {
      min_sampling_date: filters.min_sampling_date,
    });
  }
  if (filters.max_sampling_date === null) {
    query.andWhere('layer.sampling_date IS NULL');
  } else if (filters.max_sampling_date) {
    // We just need dataset to overlap with input interval
    query.andWhere('ds.reference_period_start <= :max_sampling_date', { max_sampling_date: filters.max_sampling_date });
    // Filtering actual layers
    query.andWhere("TO_CHAR(layer.sampling_date, 'YYYY-MM-DD') <= :max_sampling_date", {
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
  if (filters.soil_properties && filters.soil_properties.length > 0) {
    query.andWhere('soil_property.slug IN (:...soil_properties)', { soil_properties: filters.soil_properties });
  }
  if (filters.licenses && filters.licenses.length > 0) {
    // Each dataset can have multiple licenses, need to check that at least one matches
    // TODO: consider querying dataset.licenses
    query.andWhere('license.slug IN (:...licenses)', { licenses: filters.licenses });
  }

  await applyRasterFilterToQuery(query, dataFilter, rasterFilterTables);

  return query;
};

const getEnabledRasterFilterTables = async () => {
  const rasterFilterService = new RasterFilterService();
  const dataSource = await getDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  const enabledFilters = await rasterFilterService.getEnabledRasterFilters({ entityManager: queryRunner.manager });
  const rasterFilterTables = enabledFilters.map(f => f.id);
  await queryRunner.release();
  return rasterFilterTables;
};

const applyRasterFilterToQuery = async (
  query: SelectQueryBuilder<DatasetLayerEntity>,
  dataFilter: DataFilter,
  enabledRasterFilterTables?: string[],
) => {
  if (dataFilter.geometries.length === 0) {
    // No input geometry, raster filtering cannot be applied
    return;
  }

  if (!hasRasterFilters(dataFilter)) {
    // Nothing to do
    return;
  }

  const rasterFilterTables = enabledRasterFilterTables || (await getEnabledRasterFilterTables());
  if (rasterFilterTables.length === 0) {
    // No raster data is available
    query.innerJoin('candidate_features', 'matching_features', 'dataset_layers.feature_id = matching_features.id');
    return;
  }

  const raster_filters: Record<string, number[]> | undefined = dataFilter.parameters.raster_filters;
  const aoiAreaM2 = turf.area(dataFilter.geometries[0]!);

  for (const baseTable of rasterFilterTables) {
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
      query.addCommonTableExpression(
        `
        SELECT cf.id, cf.geom
        FROM candidate_features cf
          CROSS JOIN ${clippedRaster} cr
        WHERE (
            cf.geom_type = 'POINT'
            AND ST_Value(cr.rast, cf.geom, TRUE) IN (${values.join(',')})
          )
          OR (
            cf.geom_type = ANY('{POLYGON,MULTIPOLYGON}')
            AND EXISTS (
              SELECT 1
              FROM unnest(
                  ST_DumpValues(ST_Clip(cr.rast, cf.geom, touched => TRUE), 1)
                ) v
              WHERE v = ANY(ARRAY[${values.join(',')}])
            )
          )
        `,
        'matching_features',
        { materialized: true },
      );

      query.innerJoin('matching_features', 'matching_features', 'matching_features.id = dataset_layers.feature_id');
    }
  }
};

const addRasterCoverage = async (
  query: SelectQueryBuilder<DatasetLayerEntity>,
  dataFilter: DataFilter,
  enabledRasterFilterTables?: string[],
) => {
  if (dataFilter.geometries.length === 0) {
    // No input geometry, raster coverage cannot be applied
    return;
  }

  const rasterFilterTables = enabledRasterFilterTables || (await getEnabledRasterFilterTables());
  if (rasterFilterTables.length === 0) {
    // No raster data is available
    return;
  }

  const raster_filters: Record<string, number[]> | undefined = dataFilter.parameters.raster_filters;
  const aoiAreaM2 = turf.area(dataFilter.geometries[0]!);
  const calculateRealCoverage = aoiAreaM2 < 3_000_000_000_000;

  for (const baseTable of rasterFilterTables) {
    const outputColumn = `#${baseTable}`; // Prefixing column name with "#" to detect it in the results
    const values = raster_filters?.[baseTable];
    const hasFilteringValues = values && values.length > 0;
    const table = selectOverviewTable(baseTable, aoiAreaM2);
    const clippedRaster = `clipped_${table}`;
    if (hasFilteringValues) {
      // Adding same input values
      query.addSelect(`ARRAY[${values.join(',')}]`, outputColumn);
    } else {
      // Get all values from mappings
      let selectValues = `ARRAY(SELECT value::numeric FROM jsonb_each_text((SELECT mappings FROM raster_filters WHERE id = '${baseTable}')))`;
      if (calculateRealCoverage) {
        // Add a select column with all raster values intersecting the input geometry
        // Use ST_DumpValues to get all values as an array
        query.addCommonTableExpression(
          `
        SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) as rast FROM ${process.env.POSTGRES_SCHEMA}.${table} rr
        CROSS JOIN aoi
        WHERE ST_Intersects(rr.rast, aoi.geom)`,
          clippedRaster,
          { materialized: true },
        );
        selectValues = `ARRAY(
            SELECT DISTINCT val
            FROM (
                SELECT unnest(ST_DumpValues(${clippedRaster}.rast, 1)) AS val
                FROM ${clippedRaster}
            ) t
            WHERE val IS NOT NULL
        )`;
      }
      query.addSelect(selectValues, outputColumn);
    }
  }
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

const validateAndGetCursor = (cursor: string, sort?: string): Cursor => {
  // Decode from base64 string
  const decodedCursor = decodeCursor(cursor);
  if (!sort) {
    return decodedCursor;
  }
  // Sorting field, if present, should be consistent with cursor sorting
  if (decodedCursor.column !== sort) {
    throw new ErrorResponse(`Sort field is not matching cursor: ${sort} != ${decodedCursor.column}`, StatusCodes.BAD_REQUEST);
  }
  return decodedCursor;
};

// Map selected field aliases to their table-qualified column names
const getSortFieldMapping = (): Record<string, string> => ({
  id: 'obs.id',
  value: 'obs.value',
  dataset_id: 'ds.slug',
  dataset_name: 'ds.name',
  soil_property: 'soil_property.slug',
  property_acronym: 'soil_property.property_acronym',
  standard_unit: 'soil_property.standard_unit',
  geometry: 'matching_features.geom',
  license_name: 'license.name',
  sampling_date: 'layer.sampling_date',
  min_depth: 'layer.min_depth',
  max_depth: 'layer.max_depth',
  horizon: 'layer.horizon',
  sample_pretreatment: 'procedure.sample_pretreatment',
  technique: 'procedure.technique',
  laboratory_method: 'procedure.laboratory_method',
  extractant_concentration: 'procedure.extractant_concentration',
  extraction_ratio: 'procedure.extraction_ratio',
  extraction_base: 'procedure.extraction_base',
  measurement_procedure: 'procedure.measurement_procedure',
  limit_of_detection: 'procedure.limit_of_detection',
});

const getMappedSortField = (sort: string): string => {
  const sortFieldMapping = getSortFieldMapping();
  const qualifiedColumn = sortFieldMapping[sort];
  if (!qualifiedColumn) {
    throw new ErrorResponse(`Unknown sort field: ${sort}`, StatusCodes.BAD_REQUEST);
  }
  return qualifiedColumn;
};

const applyCursorToQuery = (query: any, encodedCursor?: string, sort?: string) => {
  if (!encodedCursor) {
    return;
  }
  const cursor = validateAndGetCursor(encodedCursor!, sort);
  if (cursor.column && cursor.value) {
    // WHERE clause should take into account two fields (sorting column first, then ID)
    const cursorId = cursor.id;
    const cursorValue = cursor.value;
    const isDesc = cursor.column.startsWith('-');
    const operator = isDesc ? '<' : '>';
    let sortCol = cursor.column;
    if (sortCol.startsWith('-')) {
      sortCol = sortCol.substring(1);
    }
    // Get the correct table-qualified column name
    const qualifiedColumn = getMappedSortField(sortCol);
    query.andWhere(`(${qualifiedColumn}, obs.id) ${operator} (:cursorValue, :cursorId)`, { cursorValue, cursorId });
    return;
  }

  // Basic cursor: filter by observation.id
  query.andWhere('obs.id > :cursorId', { cursorId: cursor.id });
};

const applySortingToQuery = (query: any, sort?: string) => {
  if (!sort) {
    // Default: sort by obs.id ascending
    query.orderBy('obs.id', 'ASC');
    return;
  }

  let sortField = sort;
  let sortDirection: 'ASC' | 'DESC' = 'ASC';
  if (sortField.startsWith('-')) {
    sortField = sortField.substring(1);
    sortDirection = 'DESC';
  }

  // Get the correct table-qualified column name
  const qualifiedColumn = getMappedSortField(sortField);

  // Use stable secondary sort by obs.id for consistent pagination
  query.orderBy(qualifiedColumn, sortDirection).addOrderBy('obs.id', sortDirection);
};
