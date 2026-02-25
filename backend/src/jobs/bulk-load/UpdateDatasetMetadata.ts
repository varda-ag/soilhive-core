import * as wellknown from 'wellknown';
import { EntityManager } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetLayerEntity from '../../entities/DatasetLayer';
import assert from 'assert';
import { MeasuredProperty } from '../../interfaces/Dataset';
import { IngestionStatus } from '../../types/data';
import { toGisDatatype } from '../../utils/geometry';

export const updateDatasetMetadata = async (entityManager: EntityManager, datasetId: string, status: IngestionStatus): Promise<void> => {
  // Get dataset layers
  const datasetLayers = await entityManager
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
      'l.min_depth',
      'l.max_depth',
      'l.sampling_date::text',
      'ST_GeometryType(f.geom) AS gis_datatype',
      'prop.slug',
      'proc.slug',
      'lic.slug',
    ])
    .getRawMany();

  // Build measured_properties array (distinct soil properties with procedure info)
  const measured_properties: MeasuredProperty[] = [];
  const propertySet = new Set<string>();

  datasetLayers.forEach(row => {
    const propertyKey = `${row.prop_slug}_${row.proc_slug}`;
    if (!propertySet.has(propertyKey)) {
      propertySet.add(propertyKey);
      measured_properties.push({
        soil_property_id: row.prop_slug,
        procedure_id: row.proc_slug,
      });
    }
  });

  // Build aggregated licenses
  const licenses = [...new Set(datasetLayers.map(row => row.lic_slug).filter(Boolean))];
  const n_observations = datasetLayers.length;

  // Soil depth aggregation
  const depths = datasetLayers.map(row => ({ min: row.l_min_depth, max: row.l_max_depth })).filter(d => d.min != null || d.max != null);
  const soilDepthMin = depths.length > 0 ? Math.min(...depths.map(d => d.min ?? Infinity)) : null;
  const soilDepthMax = depths.length > 0 ? Math.max(...depths.map(d => d.max ?? -Infinity)) : null;
  const soil_depth = soilDepthMin != null || soilDepthMax != null ? { min: soilDepthMin, max: soilDepthMax } : null;

  // Spatial extent
  const spatialExtentResult = await entityManager.query(
    `SELECT ST_Extent(f.geom) as extent
     FROM dataset_layers dl
     JOIN features f ON f.id = dl.feature_id
     WHERE dl.dataset_id = $1`,
    [datasetId],
  );
  const spatial_extent_box = spatialExtentResult[0]?.extent || null;
  const spatial_extent_polygon = spatial_extent_box ? boxToPolygonWkt(spatial_extent_box) : null;
  const spatial_extent = spatial_extent_box ? wellknown.parse(spatial_extent_polygon) : null;

  // Reference period
  const samplingDates = datasetLayers
    .map(row => row.sampling_date)
    .filter(Boolean)
    .sort();
  const reference_period_start = samplingDates[0] || null;
  const reference_period_stop = samplingDates[samplingDates.length - 1] || null;

  // GIS datatype
  const geomTypes = [...new Set(datasetLayers.map(row => row.gis_datatype).filter(Boolean))];
  assert(geomTypes.length <= 1, `Expected at most one geometry type, got ${geomTypes.join(', ')}`);
  const gis_datatype = geomTypes.length > 0 ? toGisDatatype(geomTypes[0]) : null;

  // Step 4: Update dataset
  await entityManager
    .getRepository(DatasetEntity)
    .createQueryBuilder()
    .update(DatasetEntity)
    .set({
      status,
      measured_properties,
      licenses,
      n_observations: n_observations.toString(),
      soil_depth,
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
