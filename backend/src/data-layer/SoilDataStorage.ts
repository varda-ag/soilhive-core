import { Polygon, MultiPolygon } from 'geojson';
import { OverlapType } from '../types/enums';
import { EntityManager } from 'typeorm';
import { FilteredDataset, FilterableDatasetMetadata } from '../interfaces/DatasetFilter';
import DatasetEntity from '../entities/Dataset';
import DatasetLayerEntity from '../entities/DatasetLayer';

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

  filter = async (
    entityManager: EntityManager,
    geometry: Polygon | MultiPolygon,
    filters: FilterableDatasetMetadata,
  ): Promise<FilteredDataset[]> => {
    const geom = JSON.stringify(geometry);
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = await repo
      .createQueryBuilder('dataset_layers')
      .leftJoin('dataset_layers.dataset', 'ds')
      .leftJoin('dataset_layers.layer', 'layer')
      .innerJoin('dataset_layers.feature', 'features')
      .where('ST_Intersects(ds.spatial_extent, ST_GeomFromGeoJSON(:geom))', { geom }) // Testing intersection with entire dataset
      .andWhere('ST_Intersects(features.geom, ST_GeomFromGeoJSON(:geom))', { geom }) // Testing intersection with individual features
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('ds.gis_datatype', 'gis_datatype')
      .addSelect('ds.name', 'dataset_name')
      .addSelect("STRING_AGG(DISTINCT layer.license::text, ',')", 'licenses')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .addSelect('MIN(layer.sampling_date)', 'min_sampling_date')
      .addSelect('MAX(layer.sampling_date)', 'max_sampling_date')
      .addSelect('MIN(layer.min_depth)', 'min_depth')
      .addSelect('MAX(layer.max_depth)', 'max_depth')
      .addSelect("STRING_AGG(DISTINCT layer.horizon, ',')", 'horizons')
      .addSelect("STRING_AGG(DISTINCT dataset_layers.soil_property_id::text, ',')", 'soil_properties')
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
      min_depth: row.min_depth ? parseFloat(row.min_depth) : null,
      max_depth: row.max_depth ? parseFloat(row.max_depth) : null,
      horizons: row.horizons ? row.horizons.split(',') : [],
      soil_properties: row.soil_properties ? row.soil_properties.split(',') : [],
      raster_filters: undefined, // TODO: assess feasibility
      dataset_layer_count: parseInt(row.dataset_layer_count),
    }));
  };
}

const applyFiltersToQuery = (query: any, filters: FilterableDatasetMetadata) => {
  if (filters.data_types && filters.data_types.length > 0) {
    query.andWhere('ds.gis_datatype IN (:...data_types)', { data_types: filters.data_types });
  }
  if (filters.min_sampling_date === null) {
    query.leftJoin('dataset_layers.layer', 'layers_min_sampling_date');
    query.andWhere('layers_min_sampling_date.sampling_date IS NULL');
  } else if (filters.min_sampling_date) {
    // We just need dataset to overlap with input interval
    query.andWhere('ds.reference_period_stop >= :min_sampling_date', { min_sampling_date: filters.min_sampling_date });
    // Filtering actual layers
    query.leftJoin('dataset_layers.layer', 'layers_min_sampling_date');
    query.andWhere("TO_CHAR(layers_min_sampling_date.sampling_date, 'YYYY-MM-DD') >= :min_sampling_date", {
      min_sampling_date: filters.min_sampling_date,
    });
  }
  if (filters.max_sampling_date === null) {
    query.leftJoin('dataset_layers.layer', 'layers_max_sampling_date');
    query.andWhere('layers_max_sampling_date.sampling_date IS NULL');
  } else if (filters.max_sampling_date) {
    // We just need dataset to overlap with input interval
    query.andWhere('ds.reference_period_start <= :max_sampling_date', { max_sampling_date: filters.max_sampling_date });
    // Filtering actual layers
    query.leftJoin('dataset_layers.layer', 'layers_max_sampling_date'); // Note: join on the same table needs a different alias
    query.andWhere("TO_CHAR(layers_max_sampling_date.sampling_date, 'YYYY-MM-DD') <= :max_sampling_date", {
      max_sampling_date: filters.max_sampling_date,
    });
  }
  if (filters.min_depth === null) {
    query.leftJoin('dataset_layers.layer', 'layers_min_depth');
    query.andWhere('layers_min_depth.min_depth IS NULL');
  } else if (filters.min_depth !== undefined) {
    // We just need dataset to overlap with input interval
    query.andWhere("(ds.soil_depth->>'max')::int >= :min_depth", { min_depth: filters.min_depth });
    // Filtering actual layers
    query.leftJoin('dataset_layers.layer', 'layers_min_depth');
    query.andWhere('layers_min_depth.max_depth >= :min_depth', { min_depth: filters.min_depth });
  }
  if (filters.max_depth === null) {
    query.leftJoin('dataset_layers.layer', 'layers_max_depth');
    query.andWhere('layers_max_depth.max_depth IS NULL');
  } else if (filters.max_depth !== undefined) {
    // We just need dataset to overlap with input interval
    query.andWhere("(ds.soil_depth->>'min')::int <= :max_depth", { max_depth: filters.max_depth });
    // Filtering actual layers
    query.leftJoin('dataset_layers.layer', 'layers_max_depth');
    query.andWhere('layers_max_depth.min_depth <= :max_depth', { max_depth: filters.max_depth });
  }
  if (filters.horizons && filters.horizons.length > 0) {
    const nullQuery = filters.horizons.includes(null) ? 'OR layers_horizons.horizon IS NULL' : '';
    query.leftJoin('dataset_layers.layer', 'layers_horizons');
    query.andWhere(`layers_horizons.horizon IN (:...horizons) ${nullQuery}`, { horizons: filters.horizons });
  }
  if (filters.soil_properties && filters.soil_properties.length > 0) {
    query.andWhere('dataset_layers.soil_property_id IN (:...soil_properties)', { soil_properties: filters.soil_properties });
  }
  if (filters.licenses && filters.licenses.length > 0) {
    // Each dataset can have multiple licenses, need to check that at least one matches
    // TODO: consider querying dataset.licenses
    query.leftJoin('dataset_layers.layer', 'layers_licenses');
    query.andWhere('layers_licenses.license IN (:...licenses)', { licenses: filters.licenses });
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
