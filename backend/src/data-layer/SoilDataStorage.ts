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
    _: FilterableDatasetMetadata,
  ): Promise<FilteredDataset[]> => {
    const repo = entityManager.getRepository(DatasetLayerEntity);
    const results = await repo
      .createQueryBuilder('dataset_layers')
      .innerJoin('dataset_layers.feature', 'features')
      .where('ST_Intersects(features.geom, ST_GeomFromGeoJSON(:geom))', {
        geom: JSON.stringify(geometry),
      })
      .select('dataset_layers.dataset_id', 'dataset_id')
      .addSelect('COUNT(dataset_layers.dataset_id)', 'dataset_layer_count')
      .groupBy('dataset_layers.dataset_id')
      .getRawMany();
    return results.map(row => ({
      id: row.dataset_id,
      dataset_layer_count: parseInt(row.dataset_layer_count),
    }));
  };
}
