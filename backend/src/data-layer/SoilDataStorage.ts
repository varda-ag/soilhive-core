import { Polygon, MultiPolygon } from 'geojson';
import { OverlapType } from '../types/enums';
import { EntityManager } from 'typeorm';
import DatasetEntity from '../entities/Dataset';

export default class SoilDataStorage {
  getOverlapType = async (entityManager: EntityManager, geometry: Polygon | MultiPolygon): Promise<Map<string, OverlapType>> => {
    const repo = entityManager.getRepository(DatasetEntity);
    const results = await repo
      .createQueryBuilder('datasets')
      .select('user.id', 'id')
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
}
