import { EntityManager } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetLayerEntity from '../../entities/DatasetLayer';
import assert from 'assert';
import { IngestionStatus } from '../../types/data';
import { toGisDatatype } from '../../utils/geometry';

export const updateDatasetMetadata = async (entityManager: EntityManager, datasetId: string, status: IngestionStatus): Promise<void> => {
  // Override global statement timeout, long running query
  await entityManager.query("SET LOCAL statement_timeout = '3min';");
  // Get dataset layers
  const tmp = await entityManager
    .getRepository(DatasetLayerEntity)
    .createQueryBuilder('dl')
    .leftJoin('dl.layer', 'l')
    .leftJoin('dl.feature', 'f')
    .leftJoin('dl.soil_property', 'prop')
    .leftJoin('observations', 'o', 'o.dataset_layer_id = dl.id')
    .leftJoin('o.procedure', 'proc')
    .leftJoin('licenses', 'lic', 'l.license = lic.id')
    .where('dl.dataset_id = :datasetId', { datasetId })
    .select([
      'COUNT(1) AS n_observations',
      'MIN(l.min_depth) AS min_depth',
      'MAX(l.max_depth) AS max_depth',
      'MIN(l.sampling_date) AS min_sampling_date',
      'MAX(l.sampling_date) AS max_sampling_date',
      'ST_AsGeoJSON(ST_Extent(f.geom)) as extent',
      'array_agg(distinct ST_GeometryType(f.geom)) AS gis_datatypes',
      "array_agg(distinct jsonb_build_object('soil_property_id', prop.slug, 'procedure_id', proc.slug)) AS measured_properties",
      'array_agg(distinct lic.slug) AS licenses',
    ])
    .getRawMany();

  assert(tmp.length === 1, 'Expecting one aggregated result row');
  const data = tmp[0];

  // GIS datatype check
  const geomTypes = data.gis_datatypes.filter(Boolean);
  assert(geomTypes.length <= 1, `Expected at most one geometry type, got ${geomTypes.join(', ')}`);
  const gis_datatype = geomTypes.length > 0 ? toGisDatatype(geomTypes[0]) : null;

  // Update dataset
  await entityManager
    .getRepository(DatasetEntity)
    .createQueryBuilder()
    .update(DatasetEntity)
    .set({
      status,
      measured_properties: data.measured_properties,
      licenses: data.licenses,
      n_observations: data.n_observations,
      soil_depth: { min: data.min_depth, max: data.max_depth },
      spatial_extent: data.extent ? JSON.parse(data.extent) : null,
      reference_period_start: data.min_sampling_date,
      reference_period_stop: data.max_sampling_date,
      gis_datatype,
      updated_at: new Date(),
    })
    .where('id = :datasetId', { datasetId })
    .execute();
};
