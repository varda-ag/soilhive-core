import { Polygon, MultiPolygon } from 'geojson';
import { EntityManager } from 'typeorm';
import { FilterCriteria } from '../interfaces/DatasetFilter';

export interface DaiPointRow {
  lon: number;
  lat: number;
  num_soil_properties: number;
  num_props_below_30: number;
  num_dated_layers: number;
  num_distinct_years: number;
}

/**
 * The precomputed feature_dai_stats rows are only valid for the unfiltered DAI
 * case: every FilterCriteria key changes what the per-feature counts include, so
 * any present key (including explicit nulls, which filter for undated/undepthed
 * layers) forces the live getDaiPointData path. raster_filters with only empty
 * value arrays is treated as absent, matching buildRasterSql, which ignores them.
 */
export const isUnfilteredDaiParameters = (parameters: FilterCriteria): boolean => {
  if (!parameters) {
    return true;
  }
  const filteringKeys: (keyof FilterCriteria)[] = [
    'data_types',
    'licenses',
    'min_sampling_date',
    'max_sampling_date',
    'min_depth',
    'max_depth',
    'horizons',
    'soil_properties',
  ];
  if (filteringKeys.some(key => parameters[key] !== undefined)) {
    return false;
  }
  return Object.values(parameters.raster_filters ?? {}).every(values => values.length === 0);
};

/**
 * Fast-path counterpart of SoilDataStorage.getDaiPointData for unfiltered
 * requests: reads the ingestion-time feature_dai_stats rows via the GiST index
 * on centroid instead of aggregating dataset_layers per feature. Selection is by
 * centroid (the point that getDaiPointData would emit anyway), not by feature
 * polygon: a polygonal feature straddling the AOI edge with its centroid outside
 * is dropped here, where the legacy path returned it binned to an outside cell.
 */
export const getDaiPointDataPrecomputed = async (entityManager: EntityManager, aoi: Polygon | MultiPolygon): Promise<DaiPointRow[]> => {
  const schema = process.env.POSTGRES_SCHEMA;
  const sql = `
    WITH aoi AS MATERIALIZED (
      SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON($1), 'method=structure'), 3) AS geom
    )
    SELECT
      ST_X(s.centroid) AS lon,
      ST_Y(s.centroid) AS lat,
      s.num_soil_properties,
      s.num_props_below_30,
      s.num_dated_layers,
      s.num_distinct_years
    FROM ${schema}.feature_dai_stats s
    JOIN aoi ON ST_Intersects(s.centroid, aoi.geom)
  `;
  return entityManager.query(sql, [JSON.stringify(aoi)]);
};

// The per-feature aggregate. Mirrors the unfiltered branch of
// SoilDataStorage.getDaiPointData and must stay in lockstep with it: same dataset
// predicates (deleted_at IS NULL, gis_datatype != 'raster' — deliberately no
// status filter) and the same four counts. scripts/dai-stats-backfill.sql inlines
// the same rebuild for existing DBs — keep the two in sync.
const daiAggregateLateral = (schema: string): string => `
  SELECT
    COUNT(DISTINCT dl.soil_property_id)::int AS num_soil_properties,
    COUNT(DISTINCT CASE WHEN layer.max_depth > 30 THEN dl.soil_property_id END)::int AS num_props_below_30,
    COUNT(DISTINCT layer.id) FILTER (WHERE layer.sampling_date IS NOT NULL)::int AS num_dated_layers,
    COUNT(DISTINCT LEFT(layer.sampling_date, 4)::int)::int AS num_distinct_years
  FROM ${schema}.dataset_layers dl
  INNER JOIN ${schema}.datasets ds ON ds.id = dl.dataset_id
    AND ds.deleted_at IS NULL
    AND ds.gis_datatype != 'raster'
  INNER JOIN ${schema}.layers layer ON layer.id = dl.layer_id
  WHERE dl.feature_id = f.id
`;

const upsertFromComputed = (schema: string): string => `
  INSERT INTO ${schema}.feature_dai_stats (feature_id, centroid, num_soil_properties, num_props_below_30, num_dated_layers, num_distinct_years)
  SELECT id, centroid, num_soil_properties, num_props_below_30, num_dated_layers, num_distinct_years
  FROM computed
  WHERE num_soil_properties > 0
  ON CONFLICT (feature_id) DO UPDATE SET
    centroid = EXCLUDED.centroid,
    num_soil_properties = EXCLUDED.num_soil_properties,
    num_props_below_30 = EXCLUDED.num_props_below_30,
    num_dated_layers = EXCLUDED.num_dated_layers,
    num_distinct_years = EXCLUDED.num_distinct_years
  RETURNING feature_id
`;

/**
 * Recompute feature_dai_stats rows.
 *
 * Staleness contract (mirrors bumpCacheEpoch, ADR 0008/0009): every write path
 * that changes DAI inputs — dataset_layers/layers rows or the datasets columns
 * deleted_at / gis_datatype — must call this.
 *
 * Scoped refreshes (datasetIds given) resolve affected features through the
 * dataset's CURRENT dataset_layers rows, so they must run while those rows still
 * exist: on soft-delete before any hard delete of dataset_layers. After a hard
 * delete that unlinks features from a dataset, only a full refresh (no
 * datasetIds) restores correctness for features shared with other datasets.
 *
 * Each mode is a single statement (upsert + prune via data-modifying CTEs), so a
 * refresh is atomic on its own and composes with the request-scoped transaction
 * when the entityManager is transactional. The full rebuild upserts in place —
 * concurrent readers never observe an emptied table.
 */
export const refreshDaiStats = async (entityManager: EntityManager, datasetIds?: string[]): Promise<void> => {
  const schema = process.env.POSTGRES_SCHEMA!;
  if (!datasetIds) {
    await entityManager.query(`
      WITH computed AS MATERIALIZED (
        SELECT f.id, ST_Centroid(f.geom) AS centroid, agg.num_soil_properties, agg.num_props_below_30, agg.num_dated_layers, agg.num_distinct_years
        FROM ${schema}.features f
        CROSS JOIN LATERAL (${daiAggregateLateral(schema)}) agg
      ),
      upserted AS (${upsertFromComputed(schema)})
      DELETE FROM ${schema}.feature_dai_stats s
      WHERE NOT EXISTS (
        SELECT 1 FROM computed c WHERE c.id = s.feature_id AND c.num_soil_properties > 0
      )
    `);
    return;
  }
  await entityManager.query(
    `
    WITH affected AS (
      SELECT DISTINCT dl.feature_id AS id
      FROM ${schema}.dataset_layers dl
      WHERE dl.dataset_id = ANY($1::uuid[])
    ),
    computed AS MATERIALIZED (
      SELECT f.id, ST_Centroid(f.geom) AS centroid, agg.num_soil_properties, agg.num_props_below_30, agg.num_dated_layers, agg.num_distinct_years
      FROM ${schema}.features f
      INNER JOIN affected a ON a.id = f.id
      CROSS JOIN LATERAL (${daiAggregateLateral(schema)}) agg
    ),
    upserted AS (${upsertFromComputed(schema)})
    DELETE FROM ${schema}.feature_dai_stats s
    USING computed c
    WHERE s.feature_id = c.id AND c.num_soil_properties = 0
  `,
    [datasetIds],
  );
};
