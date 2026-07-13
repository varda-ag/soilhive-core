import { EntityManager } from 'typeorm';
import { FilterCriteria } from '../interfaces/DatasetFilter';
import { getVectorMaskCtes } from './FilteringMasks';
import { getEnabledRasterFilterTables, hasRasterFilters } from './SoilDataStorage';
import { viewportAoiParams, viewportAoiSql } from './ViewportAoi';

export interface DaiPointRow {
  lon: number;
  lat: number;
  num_soil_properties: number;
  num_props_below_30: number;
  num_dated_layers: number;
  num_distinct_years: number;
}

/**
 * The precomputed feature_dai_stats rows are only valid when no criterion
 * changes what the per-feature counts include: any present key (explicit nulls
 * too, which filter for undated/undepthed layers) forces the live
 * getDaiPointData path. raster_filters is deliberately NOT a criterion here —
 * it never enters the count aggregation; the fast path applies it as a spatial
 * mask on the AOI instead (see getDaiPointDataPrecomputed).
 */
export const isPrecomputableDaiParameters = (parameters: FilterCriteria): boolean => {
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
  return !filteringKeys.some(key => parameters[key] !== undefined);
};

/**
 * Fast-path counterpart of SoilDataStorage.getDaiPointData: reads the
 * ingestion-time feature_dai_stats rows via the GiST index on centroid instead
 * of aggregating dataset_layers per feature.
 *
 * The AOI is resolved in-DB (ADR 0010): the Filter's persistent subdivision
 * pieces clipped to the viewport envelope (viewportAoiSql), so no geometry is
 * bound as a parameter at all — only the bbox numbers and the geometry ids.
 * Active raster filters become a vector mask on the AOI (getVectorMaskCtes:
 * AOI ∩ union of matching pixels), composed as CTEs into this same statement so
 * the mask geometry — potentially megabytes of vectorized pixels — never
 * round-trips through GeoJSON.
 *
 * Selection semantics are centroid-based throughout: a feature counts where its
 * centroid is, for the AOI and the raster mask alike. Point features match the
 * legacy per-feature ST_Value test exactly; a polygonal feature whose centroid
 * sits on a non-matching pixel is dropped here even when its shape overlaps
 * matching pixels elsewhere (the legacy path counted it) — the same trade-off
 * already accepted for AOI selection in ADR 0009.
 */
export const getDaiPointDataPrecomputed = async (
  entityManager: EntityManager,
  geometryIds: string[],
  bbox: [number, number, number, number],
  parameters: FilterCriteria,
  aoiAreaM2: number,
): Promise<DaiPointRow[]> => {
  const schema = process.env.POSTGRES_SCHEMA;
  const aoiSeedSql = viewportAoiSql(geometryIds.length > 0);

  // Mirrors buildRasterSql's activation rule: only enabled tables with a
  // non-empty value selection mask anything; otherwise the plain AOI is used.
  const enabledRasterFilterTables = hasRasterFilters(parameters) ? await getEnabledRasterFilterTables() : [];
  const rasterMaskActive = enabledRasterFilterTables.some(table => (parameters.raster_filters?.[table]?.length ?? 0) > 0);

  let cteSql: string;
  if (rasterMaskActive) {
    const ctes = await getVectorMaskCtes(
      entityManager,
      { geometryIds: [], parameters, area: aoiAreaM2 },
      { name: 'aoi_raw', sql: aoiSeedSql, materialized: true },
    );
    cteSql = ctes.map(cte => `${cte.name}${cte.materialized ? ' AS MATERIALIZED' : ''} (${cte.sql})`).join(',\n    ');
  } else {
    cteSql = `aoi AS MATERIALIZED (${aoiSeedSql})`;
  }

  // The non-masked aoi CTE is piece rows, so a centroid sitting exactly on a
  // shared subdivision edge would join twice: DISTINCT ON (feature_id) dedupes
  // without collapsing distinct coincident features. Keep the JOIN (not an
  // EXISTS semi-join, which pins the stats table as outer and seq-scans — same
  // reasoning as filterVector's aoi_features).
  const sql = `
    WITH ${cteSql}
    SELECT DISTINCT ON (s.feature_id)
      ST_X(s.centroid) AS lon,
      ST_Y(s.centroid) AS lat,
      s.num_soil_properties,
      s.num_props_below_30,
      s.num_dated_layers,
      s.num_distinct_years
    FROM ${schema}.feature_dai_stats s
    JOIN aoi ON ST_Intersects(s.centroid, aoi.geom)
  `;
  return entityManager.query(sql, viewportAoiParams(bbox, geometryIds));
};

// The per-feature aggregate. Mirrors the unfiltered branch of
// SoilDataStorage.getDaiPointData and must stay in lockstep with it: same dataset
// predicates (deleted_at IS NULL, status = 'PUBLISHED', gis_datatype != 'raster')
// and the same four counts. Backfilling an existing DB = one full
// refreshDaiStats(entityManager) call; there is no SQL copy to keep in sync.
const daiAggregateLateral = (schema: string): string => `
  SELECT
    COUNT(DISTINCT dl.soil_property_id)::int AS num_soil_properties,
    COUNT(DISTINCT CASE WHEN layer.max_depth > 30 THEN dl.soil_property_id END)::int AS num_props_below_30,
    COUNT(DISTINCT layer.id) FILTER (WHERE layer.sampling_date IS NOT NULL)::int AS num_dated_layers,
    COUNT(DISTINCT LEFT(layer.sampling_date, 4)::int)::int AS num_distinct_years
  FROM ${schema}.dataset_layers dl
  INNER JOIN ${schema}.datasets ds ON ds.id = dl.dataset_id
    AND ds.deleted_at IS NULL
    AND ds.status = 'PUBLISHED'
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
 * deleted_at / status / gis_datatype — must call this.
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
