import { EntityManager } from 'typeorm';
import type { Envelope } from '../utils/GdalCLI';

interface FileBboxRow {
  dataset_id: string;
  bbox_wgs84: Envelope | null;
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * The Bounding box of each File behind a live Raster Layer of the given Datasets, keyed by Dataset
 * id. A File probed before bbox_wgs84 existed counts as its Raster Layers' stored extent: for one
 * crossing the antimeridian, the whole band of longitude.
 */
export async function getRasterFileBboxes(entityManager: EntityManager, datasetIds: string[]): Promise<Map<string, Envelope[]>> {
  const rows: FileBboxRow[] = await entityManager.query(
    `SELECT rl.dataset_id, f.metadata->'bbox_wgs84' AS bbox_wgs84,
            ST_XMin(ST_Extent(rl.bbox)) AS west, ST_YMin(ST_Extent(rl.bbox)) AS south,
            ST_XMax(ST_Extent(rl.bbox)) AS east, ST_YMax(ST_Extent(rl.bbox)) AS north
     FROM raster_layers rl
     JOIN files f ON f.id = rl.file_id
     WHERE rl.dataset_id = ANY($1::uuid[]) AND rl.deleted_at IS NULL
     GROUP BY rl.dataset_id, f.id`,
    [datasetIds],
  );
  const bboxes = new Map<string, Envelope[]>();
  for (const { dataset_id, bbox_wgs84, west, south, east, north } of rows) {
    bboxes.set(dataset_id, [...(bboxes.get(dataset_id) ?? []), bbox_wgs84 ?? [west, south, east, north]]);
  }
  return bboxes;
}
