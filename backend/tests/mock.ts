import { v7 as uuidv7 } from 'uuid';
import DatasetEntity from '../src/entities/Dataset';
import { getPolygonFromBbox } from '../src/utils/geometry';

export const newDataset = (slug: string, spatial_extent: number[]): DatasetEntity => {
  const dataset = new DatasetEntity();
  dataset.id = uuidv7();
  dataset.name = `Name ${slug}`;
  dataset.slug = slug;
  dataset.created_by = 'tests';
  dataset.spatial_extent = getPolygonFromBbox(spatial_extent);
  return dataset;
};
