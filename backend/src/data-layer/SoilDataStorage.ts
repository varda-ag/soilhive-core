import { Polygon, MultiPolygon } from 'geojson';
import { OverlapType } from '../types/enums';
import { EntityManager } from 'typeorm';
import { FilteredDataset, FilterCriteria, DataFilter } from '../interfaces/DatasetFilter';
import DatasetEntity from '../entities/Dataset';
import DatasetLayerEntity from '../entities/DatasetLayer';
import { SoilDataSample } from '../interfaces/SoilDataSample';
import assert from 'assert';

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
    const geom = JSON.stringify(geometry);
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = await repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.dataset', 'ds')
      .leftJoin('dataset_layers.layer', 'layer')
      .leftJoin('dataset_layers.soil_property', 'soil_property')
      .leftJoin('layer.license_obj', 'license')
      .innerJoin('dataset_layers.feature', 'features')
      .where('ST_Intersects(ds.spatial_extent, ST_GeomFromGeoJSON(:geom))', { geom }) // Testing intersection with entire dataset
      .andWhere('ST_Intersects(features.geom, ST_GeomFromGeoJSON(:geom))', { geom }) // Testing intersection with individual features
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('ds.gis_datatype', 'gis_datatype')
      .addSelect('ds.name', 'dataset_name')
      .addSelect("STRING_AGG(DISTINCT license.slug, ',')", 'licenses')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .addSelect('MIN(layer.sampling_date)', 'min_sampling_date')
      .addSelect('MAX(layer.sampling_date)', 'max_sampling_date')
      .addSelect('MIN(layer.min_depth)', 'min_depth')
      .addSelect('MAX(layer.max_depth)', 'max_depth')
      .addSelect("STRING_AGG(DISTINCT layer.horizon, ',')", 'horizons')
      .addSelect("STRING_AGG(DISTINCT soil_property.slug, ',')", 'soil_properties')
      .groupBy('dataset_layers.dataset_id, ds.name, ds.gis_datatype');

    applyFiltersToQuery(query, filters);
    const results = await query.getRawMany();

    return results.map(row => ({
      id: row.dataset_id,
      name: row.dataset_name,
      data_types: [row.gis_datatype],
      licenses: row.licenses ? row.licenses.split(',') : [],
      min_sampling_date: row.min_sampling_date ? row.min_sampling_date.toISOString() : null,
      max_sampling_date: row.max_sampling_date ? row.max_sampling_date.toISOString() : null,
      min_depth: row.min_depth !== null ? parseFloat(row.min_depth) : null,
      max_depth: row.max_depth !== null ? parseFloat(row.max_depth) : null,
      horizons: row.horizons ? row.horizons.split(',') : [],
      soil_properties: row.soil_properties ? row.soil_properties.split(',') : [],
      //raster_filters // TODO: assess feasibility
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
    assert(datasetSlugs.length > 0, 'At least one dataset slug must be provided');
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.dataset', 'ds')
      .leftJoin('dataset_layers.layer', 'layer')
      .leftJoin('dataset_layers.soil_property', 'soil_property')
      .leftJoin('layer.license_obj', 'license')
      .innerJoin('dataset_layers.feature', 'features')
      .innerJoin('observations', 'obs', 'obs.dataset_layer_id = dataset_layers.id')
      .where('ds.slug IN (:...datasetSlugs)', { datasetSlugs });

    // Build geometry intersection condition for all geometries
    if (dataFilter.geometries.length > 0) {
      let geomWhereClause = '';
      const geomParams: any = {};
      for (let i = 0; i < dataFilter.geometries.length; i++) {
        const geomParam = `geom${i}`;
        geomParams[geomParam] = JSON.stringify(dataFilter.geometries[i]);
        if (i > 0) geomWhereClause += ' OR ';
        geomWhereClause += `ST_Intersects(features.geom, ST_GeomFromGeoJSON(:${geomParam}))`;
      }
      query.andWhere(`(${geomWhereClause})`, geomParams);
    }

    query
      .select('obs.id', 'id')
      .addSelect('ds.slug', 'dataset')
      .addSelect('soil_property.slug', 'soil_property')
      .addSelect('obs.value', 'value');

    applyFiltersToQuery(query, dataFilter.parameters);

    if (cursor) {
      query.andWhere('obs.id > :cursor', { cursor });
    }

    let sortField = sort || 'obs.id';
    let sortDirection: 'ASC' | 'DESC' = 'ASC';
    if (sortField.startsWith('-')) {
      sortField = sortField.substring(1);
      sortDirection = 'DESC';
    }
    // Use stable secondary sort by obs.id for consistent pagination
    query.orderBy(sortField, sortDirection).addOrderBy('obs.id', sortDirection);

    query.limit(limit);

    const results = await query.getRawMany();

    return results.map(row => ({
      id: row.id,
      dataset: row.dataset,
      soil_property: row.soil_property,
      value: parseFloat(row.value),
    }));
  };
}

const applyFiltersToQuery = (query: any, filters: FilterCriteria) => {
  if (filters.data_types && filters.data_types.length > 0) {
    query.andWhere('ds.gis_datatype IN (:...data_types)', { data_types: filters.data_types });
  }
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

  // Raster filtering
  if (filters.raster_filters && filters.raster_filters.size > 0) {
    for (const [table, values] of filters.raster_filters.entries()) {
      applyRasterFilterToQuery(query, table, values);
    }
  }
  return query;
};

const applyRasterFilterToQuery = (query: any, table: string, values: number[]) => {
  query.innerJoin('features', 'f', 'f.id = dataset_layers.feature_id');

  const t = `joined_${table}`;
  const subQuery = `SELECT rast FROM ${table} WHERE ST_Intersects(rast, f.geom) LIMIT 1`;
  query.leftJoin(
    qb => {
      qb.getQuery = () => `LATERAL (${subQuery})`;
      return qb;
    },
    t,
    'true',
  );

  query.andWhere(`ST_Value(${t}.rast, f.geom, TRUE) IN (:...values)`, { values });
  query.andWhere(`ST_Value(${t}.rast, f.geom, TRUE) IS NOT NULL`);
};
