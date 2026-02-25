import * as wellknown from 'wellknown';
import { EntityManager } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetLayerEntity from '../../entities/DatasetLayer';
import assert from 'assert';
import { IngestionStatus } from '../../types/data';
import { toGisDatatype } from '../../utils/geometry';

export const updateDatasetMetadata = async (entityManager: EntityManager, datasetId: string, status: IngestionStatus): Promise<void> => {
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
      'array_agg(distinct l.sampling_date::text) AS sampling_dates',
      'array_agg(distinct ST_GeometryType(f.geom)) AS gis_datatypes',
      "array_agg(distinct jsonb_build_object('soil_property_id', prop.slug, 'procedure_id', proc.slug)) AS measured_properties",
      'array_agg(distinct lic.slug) AS licenses',
    ])
    .getRawMany();

  assert(tmp.length === 1, 'Expecting one aggregated result row');
  const data = tmp[0];

  // Spatial extent
  const spatialExtentResult = await entityManager
    .getRepository(DatasetLayerEntity)
    .createQueryBuilder('dl')
    .leftJoin('dl.feature', 'f')
    .where('dl.dataset_id = :datasetId', { datasetId })
    .select(['ST_Extent(f.geom) as extent'])
    .getRawMany();

  const spatial_extent_box = spatialExtentResult[0]?.extent || null;
  const spatial_extent_polygon = spatial_extent_box ? boxToPolygonWkt(spatial_extent_box) : null;
  const spatial_extent = spatial_extent_box ? wellknown.parse(spatial_extent_polygon) : null;

  // Reference period calculation
  const samplingDates = data.sampling_dates.filter(Boolean).sort();
  const reference_period_start = samplingDates[0] || null;
  const reference_period_stop = samplingDates[samplingDates.length - 1] || null;

  // GIS datatype
  const geomTypes = data.gis_datatypes.filter(Boolean);
  assert(geomTypes.length <= 1, `Expected at most one geometry type, got ${geomTypes.join(', ')}`);
  const gis_datatype = geomTypes.length > 0 ? toGisDatatype(geomTypes[0]) : null;

  // Step 4: Update dataset
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
      spatial_extent,
      reference_period_start,
      reference_period_stop,
      gis_datatype,
      updated_at: new Date(),
    })
    .where('id = :datasetId', { datasetId })
    .execute();
};

const boxToPolygonWkt = (boxWkt: string): string => {
  // Parse BOX(minx miny,maxx maxy)
  const match = boxWkt.match(/BOX\(([^ ]+) ([^,]+),([^ ]+) ([^)]+)\)/);
  if (!match) throw new Error('Invalid BOX format');

  const [, minX, minY, maxX, maxY] = match.map(Number);
  const polygonWkt = `POLYGON((${minX} ${minY},${maxX} ${minY},${maxX} ${maxY},${minX} ${maxY},${minX} ${minY}))`;
  return polygonWkt;
};
