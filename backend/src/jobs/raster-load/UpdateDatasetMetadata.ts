import { EntityManager } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import RasterLayerEntity from '../../entities/RasterLayer';
import assert from 'assert';
import { IngestionStatus } from '../../types/data';

/**
 * Rolls a raster dataset's metadata up from its raster layers, and is the single writer of it —
 * a Raster Ingest touches nothing at dataset level (docs/adr/0018).
 *
 * Deliberately does NOT write `licenses`, `n_observations` or `gis_datatype`, unlike the bulk-load
 * equivalent. A raster dataset has no per-record licence and no observations, so deriving those
 * would resolve to null and overwrite admin-set values; `gis_datatype` is likewise already
 * `raster` and is not re-derived from feature geometries that do not exist.
 */
export const updateRasterDatasetMetadata = async (
  entityManager: EntityManager,
  datasetId: string,
  status: IngestionStatus,
  updatedBy: string | null,
): Promise<void> => {
  // Run inside a transaction to apply local statement_timeout override
  return await entityManager.transaction(async manager => {
    await manager.query("SET LOCAL statement_timeout = '10min';");

    const tmp = await manager
      .getRepository(RasterLayerEntity)
      .createQueryBuilder('rl')
      .leftJoin('rl.soil_property', 'prop')
      .leftJoin('rl.procedure', 'proc')
      .where('rl.dataset_id = :datasetId', { datasetId })
      .andWhere('rl.deleted_at IS NULL')
      .select([
        'COUNT(rl.id) AS n_raster_layers',
        'MIN(rl.min_depth) AS min_depth',
        'MAX(rl.max_depth) AS max_depth',
        'MIN(rl.reference_period_start) AS min_reference_period',
        'MAX(rl.reference_period_stop) AS max_reference_period',
        // Coarsest layer, so the advertised resolution never overstates the detail available.
        'MAX(rl.resolution_m) AS resolution_m',
        'ST_AsGeoJSON(ST_Extent(rl.bbox)) AS extent',
        "array_agg(distinct jsonb_build_object('soil_property_id', prop.slug, 'procedure_id', proc.slug)) AS measured_properties",
      ])
      .getRawMany();

    assert(tmp.length === 1, 'Expecting one aggregated result row');
    const data = tmp[0];

    const hasContent = (arr: unknown[] | null): boolean => Array.isArray(arr) && arr.some(v => v !== null);
    const nRasterLayers = Number(data.n_raster_layers);

    const inferred_properties: string[] = [];
    if (hasContent(data.measured_properties)) inferred_properties.push('measured_properties');
    if (data.min_depth !== null && data.max_depth !== null) inferred_properties.push('soil_depth');
    if (data.extent) inferred_properties.push('spatial_extent');
    if (data.min_reference_period !== null) inferred_properties.push('reference_period_start');
    if (data.max_reference_period !== null) inferred_properties.push('reference_period_stop');
    if (data.resolution_m !== null) inferred_properties.push('spatial_resolution');
    if (nRasterLayers > 0) inferred_properties.push('n_raster_layers');

    await manager
      .getRepository(DatasetEntity)
      .createQueryBuilder()
      .update(DatasetEntity)
      .set({
        status,
        measured_properties: data.measured_properties,
        // Recomputed rather than incremented: an increment would have to be decided before the
        // layer insert reveals whether it created a row, so it drifts on re-ingest. Counting here
        // also heals counters already drifted by earlier re-runs.
        n_raster_layers: nRasterLayers,
        soil_depth: { min: data.min_depth, max: data.max_depth },
        spatial_extent: data.extent ? JSON.parse(data.extent) : null,
        spatial_resolution: data.resolution_m !== null ? `${data.resolution_m}m` : null,
        reference_period_start: data.min_reference_period,
        reference_period_stop: data.max_reference_period,
        inferred_properties,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('id = :datasetId', { datasetId })
      .execute();
  });
};
