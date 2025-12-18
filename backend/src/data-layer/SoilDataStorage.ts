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
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const query = await repo
      .createQueryBuilder('dataset_layers')
      .innerJoin('dataset_layers.feature', 'features')
      .where('ST_Intersects(features.geom, ST_GeomFromGeoJSON(:geom))', { geom: JSON.stringify(geometry) })
      .leftJoin('dataset_layers.dataset', 'ds')
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('ds.name', 'dataset_name')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .groupBy('dataset_layers.dataset_id')
      .addGroupBy('ds.name');

    applyFiltersToQuery(query, filters);
    const results = await query.getRawMany();

    return results.map(row => ({
      id: row.dataset_id,
      name: row.dataset_name,
      dataset_layer_count: parseInt(row.dataset_layer_count),
    }));
  };
}

const applyFiltersToQuery = (query: any, filters: FilterableDatasetMetadata) => {
  if (filters.data_types && filters.data_types.length > 0) {
    query.andWhere('ds.gis_datatype IN (:...data_types)', { data_types: filters.data_types });
  }
  if (filters.licenses && filters.licenses.length > 0) {
    // TODO
  }
  if (filters.min_sampling_date) {
    // TODO
  }
  if (filters.max_sampling_date) {
    // TODO
  }
  if (filters.min_depth !== undefined) {
    // We just need overlap with input interval
    query.andWhere("(ds.soil_depth->>'max')::int >= :min_depth", { min_depth: filters.min_depth });
    query.leftJoin('dataset_layers.layer', 'layers_min_depth');
    query.where('layers_min_depth.max_depth >= :min_depth', { min_depth: filters.min_depth });
  }
  if (filters.max_depth !== undefined) {
    // We just need overlap with input interval
    query.andWhere("(ds.soil_depth->>'min')::int <= :max_depth", { max_depth: filters.max_depth });
    query.leftJoin('dataset_layers.layer', 'layers_max_depth');
    query.where('layers_max_depth.min_depth <= :max_depth', { max_depth: filters.max_depth });
  }
  if (filters.horizons && filters.horizons.length > 0) {
    // TODO
  }
  if (filters.soil_properties && filters.soil_properties.length > 0) {
    // TODO
  }
  return query;
};
