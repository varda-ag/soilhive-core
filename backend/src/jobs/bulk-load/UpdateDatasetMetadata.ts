import { EntityManager } from 'typeorm';
import DatasetEntity from '../../entities/Dataset';
import DatasetLayerEntity from '../../entities/DatasetLayer';
import assert from 'assert';
import { GISDataType, IngestionStatus } from '../../types/data';
import { toGisDatatype } from '../../utils/geometry';
import { latestEnding } from '../../data-layer/SoilDataStorage';

// Degrees (about a metre) a zero-area extent is padded by, so that it is stored as a Polygon
const EXTENT_PADDING_DEG = 0.00001;

export const updateDatasetMetadata = async (entityManager: EntityManager, datasetId: string, status: IngestionStatus): Promise<void> => {
  // Run inside a transaction to apply local statement_timeout override
  return await entityManager.transaction(async manager => {
    await manager.query("SET LOCAL statement_timeout = '10min';");
    // Get dataset layers
    const tmp = await manager
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
        `${latestEnding('l.sampling_date')} AS max_sampling_date`,
        // One feature, or features on one line, have a zero-area extent, which PostGIS returns as a
        // Point or LineString and the Polygon spatial_extent column rejects
        `ST_AsGeoJSON(
          CASE WHEN ST_Area(ST_Extent(f.geom)::geometry) = 0 THEN ST_Expand(ST_Extent(f.geom), ${EXTENT_PADDING_DEG}) ELSE ST_Extent(f.geom) END
        ) as extent`,
        'array_agg(distinct ST_GeometryType(f.geom)) AS gis_datatypes',
        "array_agg(distinct jsonb_build_object('soil_property_id', prop.slug, 'procedure_id', proc.slug)) AS measured_properties",
        'array_remove(array_agg(distinct lic.slug), NULL) AS licenses',
      ])
      .getRawMany();

    assert(tmp.length === 1, 'Expecting one aggregated result row');
    const data = tmp[0];

    // GIS datatype check — one data type per dataset; Polygon and MultiPolygon both count as polygonal
    const geomTypes = data.gis_datatypes.filter(Boolean);
    const dataTypes = Array.from(new Set<GISDataType>(geomTypes.map((t: string) => toGisDatatype(t))));
    assert(dataTypes.length <= 1, `Expected at most one data type, got ${dataTypes.join(', ')}`);
    const gis_datatype = dataTypes[0] ?? null;

    const hasContent = (arr: unknown[] | null): boolean => Array.isArray(arr) && arr.some(v => v !== null);

    const inferred_properties: string[] = [];
    if (hasContent(data.measured_properties)) inferred_properties.push('measured_properties');
    if (hasContent(data.licenses)) inferred_properties.push('licenses');
    if (Number(data.n_observations) > 0) inferred_properties.push('n_observations');
    if (data.min_depth !== null && data.max_depth !== null) inferred_properties.push('soil_depth');
    if (data.extent) inferred_properties.push('spatial_extent');
    if (data.min_sampling_date !== null) inferred_properties.push('reference_period_start');
    if (data.max_sampling_date !== null) inferred_properties.push('reference_period_stop');
    if (gis_datatype !== null) inferred_properties.push('gis_datatype');

    // The Dataset fallback (ADR 0058) matches on these, so an aggregate the Layers left empty keeps
    // the value already there, typically the admin's, instead of wiping it
    const current = await manager.getRepository(DatasetEntity).findOneOrFail({
      where: { id: datasetId },
      select: { id: true, licenses: true, soil_depth: true, reference_period_start: true, reference_period_stop: true },
    });
    const currentDepth = (current.soil_depth ?? {}) as { min?: number | null; max?: number | null };

    // Update dataset
    await manager
      .getRepository(DatasetEntity)
      .createQueryBuilder()
      .update(DatasetEntity)
      .set({
        status,
        measured_properties: data.measured_properties,
        licenses: hasContent(data.licenses) ? data.licenses : current.licenses,
        n_observations: data.n_observations,
        soil_depth: { min: data.min_depth ?? currentDepth.min ?? null, max: data.max_depth ?? currentDepth.max ?? null },
        spatial_extent: data.extent ? JSON.parse(data.extent) : null,
        reference_period_start: data.min_sampling_date ?? current.reference_period_start,
        reference_period_stop: data.max_sampling_date ?? current.reference_period_stop,
        gis_datatype,
        inferred_properties,
        updated_at: new Date(),
      })
      .where('id = :datasetId', { datasetId })
      .execute();
  });
};
