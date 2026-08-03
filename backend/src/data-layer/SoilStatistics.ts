import { EntityManager } from 'typeorm';
import { DataFilter } from '../interfaces/DatasetFilter';
import { GISDataType } from '../types/data';
import { buildObservationCriteria, buildRasterSql, getEnabledRasterFilterTables, hasRasterFilters } from './SoilDataStorage';
import {
  BreakdownCell,
  Histogram,
  MIN_HISTOGRAM_COUNT,
  SoilStatisticsOutput,
  SoilStatisticsResult,
  StatisticsCell,
  UnitStatistics,
} from '../jobs/soil-statistics/types';
import { log, timed } from '../utils/logger';
import { round3 } from '../utils/utils';

export interface SoilStatisticsOptions {
  filter: DataFilter;
  /** UserGeometry ids that are the Aggregation Units. */
  unitIds: string[];
  /** Dataset slugs to aggregate: already entitlement-filtered and raster-free. */
  datasetSlugs: string[];
  histogramBins: number;
  /** Upper bound on L4 cells across all groups (see docs/adr/0021). */
  maxCells: number;
  workMem: string;
  statementTimeoutMs: number;
  onPhase?: (description: string, percentage: number) => Promise<void>;
  /** Throws to abort between phases. */
  assertNotCancelled?: () => Promise<void>;
}

interface RawCell {
  count: number;
  n_features: number;
  n_layers: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number | null;
  percentiles: number[] | null;
  sampling_date_min: string | null;
  sampling_date_max: string | null;
  depth_min: number | null;
  depth_max: number | null;
  horizons: string[] | null;
  laboratory_methods: string[] | null;
}

/**
 * Aggregate select list shared by every level. `o.value` is double precision in the
 * staging table (not numeric) so every statistic comes back as a JS number rather than
 * a string needing parsing — soil values are far inside float8's exact range.
 */
const CELL_METRICS = `
      COUNT(*)::int AS count,
      COUNT(DISTINCT o.feature_id)::int AS n_features,
      COUNT(DISTINCT o.layer_id)::int AS n_layers,
      MIN(o.value) AS min,
      MAX(o.value) AS max,
      AVG(o.value) AS mean,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY o.value) AS median,
      STDDEV_SAMP(o.value) AS stddev,
      percentile_cont(ARRAY[0.05, 0.25, 0.75, 0.95]) WITHIN GROUP (ORDER BY o.value) AS percentiles,
      MIN(o.sampling_date) AS sampling_date_min,
      MAX(o.sampling_date) AS sampling_date_max,
      MIN(o.min_depth)::int AS depth_min,
      MAX(o.max_depth)::int AS depth_max,
      COALESCE(ARRAY_AGG(DISTINCT o.horizon) FILTER (WHERE o.horizon IS NOT NULL), '{}') AS horizons,
      COALESCE(ARRAY_AGG(DISTINCT o.laboratory_method) FILTER (WHERE o.laboratory_method IS NOT NULL), '{}') AS laboratory_methods`;

/** Join that fans the per-Observation staging rows out across the units containing them. */
const UNIT_FAN_OUT = 'JOIN sst_unit_features uf ON uf.feature_id = o.feature_id';

// Control characters, so a slug or horizon name can never contain them. The separator is
// not optional: concatenating the parts directly makes (year 2019, 1-530cm) and
// (year 2019, 15-30cm) collide on '20191530', silently merging two cells' bin counts.
const KEY_SEPARATOR = '\u0001';
const NULL_KEY = '\u0000';
const keyOf = (...parts: (string | number | null)[]): string =>
  parts.map(part => (part === null ? NULL_KEY : String(part))).join(KEY_SEPARATOR);

/**
 * Builds the per-group bin counts.
 *
 * One pass: the group's bounds come from window aggregates over the same partition
 * that groups the output, so no separate min/max round trip is needed. Two traps are
 * handled here rather than downstream:
 *  - `width_bucket` returns bins+1 for value = max, and max is present in every group
 *    by definition, so it is clamped with LEAST or the top bin silently splits off.
 *  - `width_bucket` raises when lower = upper, which happens whenever a group's values
 *    are all identical, so those groups short-circuit to a single bin.
 */
const histogramSql = (
  keys: { expr: string; alias: string }[],
  fanOut: boolean,
  binsPlaceholder: string,
  minCountPlaceholder: string,
  where: string,
): string => {
  const partition = keys.map(k => k.expr).join(', ');
  const inner = keys.map(k => `${k.expr} AS ${k.alias}`).join(',\n          ');
  const outer = keys.map(k => k.alias).join(', ');
  // The count filter is applied here rather than while assembling, so bins for cells that
  // will not carry a histogram are never returned or held in memory — at the cell cap that
  // is most of them.
  return `
    SELECT ${outer}, bin, COUNT(*)::int AS cnt
    FROM (
      SELECT
          ${inner},
          COUNT(*) OVER w AS cell_count,
          CASE
            WHEN MAX(o.value) OVER w > MIN(o.value) OVER w
              THEN LEAST(width_bucket(o.value, MIN(o.value) OVER w, MAX(o.value) OVER w, ${binsPlaceholder}), ${binsPlaceholder})
            ELSE 1
          END AS bin
      FROM sst_obs o
      ${fanOut ? UNIT_FAN_OUT : ''}
      ${where}
      WINDOW w AS (PARTITION BY ${partition})
    ) t
    WHERE t.cell_count > ${minCountPlaceholder}
    GROUP BY ${outer}, bin`;
};

/**
 * Bin boundaries are deliberately not emitted: they are reconstructable from `min`,
 * `bin_width` and `counts.length`, and at 10 bins per cell they were the single largest
 * contributor to the output size (see docs/adr/0021 on why that budget is tight).
 *
 * Undefined below the count threshold. The bin rows are already filtered by the same
 * threshold in SQL, so `counts` being empty here would otherwise be indistinguishable
 * from a cell whose Observations all fell outside its own bounds.
 */
const buildHistogram = (cell: RawCell, bins: number, counts: Map<number, number>): Histogram | undefined => {
  const { min, max, count } = cell;
  if (count <= MIN_HISTOGRAM_COUNT) {
    return undefined;
  }
  if (!(max > min)) {
    // Every value identical: one bin, zero width.
    return { bin_width: 0, counts: [count] };
  }
  return {
    bin_width: round3((max - min) / bins),
    counts: Array.from({ length: bins }, (_, i) => counts.get(i + 1) ?? 0),
  };
};

/**
 * Deletes the keys that carry no information. A cell's key names outweigh its data at the
 * cell cap, so `null` and `[]` cost more than their absence says — and the statistics are
 * declared optional precisely so a reader treats the two as the same thing.
 *
 * Mutates in place: this runs once per cell, up to 200 000 times, so it does not copy.
 */
const dropEmptyFields = <T extends object>(cell: T): T => {
  for (const [key, value] of Object.entries(cell)) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete (cell as Record<string, unknown>)[key];
    }
  }
  return cell;
};

/**
 * Built dense and then compacted, rather than with a conditional spread per nullable
 * field: seven of them inline would bury the statistics this function exists to compute.
 * The cast is what `dropEmptyFields` earns — after it, every remaining key has a value.
 */
const toCell = (raw: RawCell, bins: number, histCounts: Map<number, number>): StatisticsCell => {
  const [p05, p25, p75, p95] = raw.percentiles ?? [raw.min, raw.min, raw.max, raw.max];
  return dropEmptyFields({
    count: raw.count,
    n_features: raw.n_features,
    n_layers: raw.n_layers,
    min: round3(raw.min),
    max: round3(raw.max),
    mean: round3(raw.mean),
    median: round3(raw.median),
    stddev: round3(raw.stddev ?? null),
    p05: round3(p05!),
    p25: round3(p25!),
    p75: round3(p75!),
    p95: round3(p95!),
    sampling_date_min: raw.sampling_date_min,
    sampling_date_max: raw.sampling_date_max,
    depth_min: raw.depth_min,
    depth_max: raw.depth_max,
    horizons: raw.horizons ?? [],
    laboratory_methods: raw.laboratory_methods ?? [],
    histogram: buildHistogram(raw, bins, histCounts),
  }) as StatisticsCell;
};

/**
 * The group keys are attached *after* the cell is compacted, because a null year or depth
 * bound is this cell's identity — the "no recorded year" bucket — and must survive.
 */
const toBreakdownCell = (
  raw: RawCell & { year: number | null; min_depth: number | null; max_depth: number | null },
  bins: number,
  histCounts: Map<number, number>,
): BreakdownCell => {
  const { depth_min: _depthMin, depth_max: _depthMax, ...cell } = toCell(raw, bins, histCounts);
  return { year: raw.year, min_depth: raw.min_depth, max_depth: raw.max_depth, ...cell };
};

const groupHistogramRows = (rows: any[], keyCols: string[]): Map<string, Map<number, number>> => {
  const out = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const key = keyOf(...keyCols.map(c => row[c] ?? null));
    let bins = out.get(key);
    if (!bins) {
      bins = new Map();
      out.set(key, bins);
    }
    bins.set(Number(row.bin), Number(row.cnt));
  }
  return out;
};

/**
 * Computes Soil Statistics for one Filter over a set of Aggregation Units.
 *
 * Runs in three stages so the tuned access path survives (see the SP-5492 notes in
 * SoilDataStorage): the units are resolved to Features first, the Observations are
 * then reached from the *distinct* Feature id array — the shape that drives a bitmap
 * index scan on dataset_layers(feature_id) — and only afterwards are the rows fanned
 * out across units. Fanning out earlier would carry a unit_id into that predicate and
 * lose the plan.
 *
 * Because the pre-fan-out staging table holds each Observation exactly once (an
 * Observation belongs to one DatasetLayer, which belongs to one Feature), the `overall`
 * figures are just a different GROUP BY over it, de-duplicated across overlapping units
 * by construction. Computing them after the fan-out would double-count.
 *
 * Both staging tables are TEMP ... ON COMMIT DROP inside one transaction: the whole
 * computation therefore sees a single snapshot, and the session settings are SET LOCAL
 * so they cannot leak back into the connection pool.
 */
export const computeSoilStatistics = async (
  entityManager: EntityManager,
  options: SoilStatisticsOptions,
): Promise<SoilStatisticsOutput> => {
  const { filter, unitIds, datasetSlugs, histogramBins, maxCells } = options;
  const schema = process.env.POSTGRES_SCHEMA;
  const progress = options.onPhase ?? (async () => undefined);
  const checkCancelled = options.assertNotCancelled ?? (async () => undefined);

  if (unitIds.length === 0 || datasetSlugs.length === 0) {
    return { results: [], truncated: false };
  }

  return entityManager.transaction(async em => {
    await em.query(`SET LOCAL work_mem = '${options.workMem}'`);
    await em.query(`SET LOCAL statement_timeout = ${Math.trunc(options.statementTimeoutMs)}`);

    // ── stage 1: units → Features ────────────────────────────────────────────────
    // DISTINCT is mandatory: a Feature intersects several subdivision pieces of the
    // same unit (docs/adr/0006), which would otherwise multiply its Observations.
    // Raster-filter parity with coverage comes free: buildRasterSql reads only the `aoi`
    // CTE, and matching_features ⊆ candidate_features = features ∩ aoi, so restricting
    // stage 1 to it is exact and still lets the unit_id be attached by the aoi join.
    const enabledRasterFilterTables = hasRasterFilters(filter.parameters) ? await getEnabledRasterFilterTables() : [];
    const { ctes: rasterCtes, usesMatchingFeatures } = buildRasterSql(filter, enabledRasterFilterTables);
    const featureSource = usesMatchingFeatures ? 'matching_features' : `${schema}.features`;

    await em.query(`CREATE TEMP TABLE sst_unit_features (unit_id uuid NOT NULL, feature_id uuid NOT NULL) ON COMMIT DROP`);
    await em.query(
      `WITH aoi AS MATERIALIZED (
         SELECT ugs.user_geometry_id AS unit_id, ugs.geom
         FROM ${schema}.user_geometry_subdivisions ugs
         WHERE ugs.user_geometry_id = ANY($1::uuid[])
       )${usesMatchingFeatures ? `,\n       ${rasterCtes}` : ''}
       INSERT INTO sst_unit_features (unit_id, feature_id)
       SELECT DISTINCT aoi.unit_id, f.id
       FROM ${featureSource} f
       JOIN aoi ON ST_Intersects(f.geom, aoi.geom)`,
      [unitIds],
    );
    await em.query('CREATE INDEX ON sst_unit_features (feature_id)');
    await em.query('ANALYZE sst_unit_features');
    await progress('Resolved sampling locations', 20);
    await checkCancelled();

    // ── stage 2: Features → Observations (pre-fan-out, one row per Observation) ───
    const params: any[] = [];
    const p = (val: any) => {
      params.push(val);
      return `$${params.length}`;
    };
    const slugPlaceholders = datasetSlugs.map(s => p(s)).join(', ');
    // Coverage parity: filterVector applies status and visibility, which the
    // /soil-data path does not (see buildObservationCriteria). Both are added here.
    const { whereClauses } = buildObservationCriteria(
      filter.parameters,
      p,
      { dataset: 'ds', layer: 'layer', soilProperty: 'sp', license: 'license' },
      { includeVisibility: true },
    );

    await em.query(`CREATE TEMP TABLE sst_obs (
        feature_id uuid NOT NULL,
        layer_id uuid NOT NULL,
        dataset_slug text NOT NULL,
        soil_property_slug text NOT NULL,
        standard_unit text,
        year int,
        min_depth int,
        max_depth int,
        horizon text,
        sampling_date text,
        laboratory_method text,
        value double precision NOT NULL
      ) ON COMMIT DROP`);

    await em.query(
      `INSERT INTO sst_obs (feature_id, layer_id, dataset_slug, soil_property_slug, standard_unit, year,
                            min_depth, max_depth, horizon, sampling_date, laboratory_method, value)
       SELECT
         dl.feature_id,
         dl.layer_id,
         ds.slug,
         sp.slug,
         sp.standard_unit,
         -- sampling_date is free text: anything not starting with four digits becomes
         -- the null year bucket rather than aborting the job on a failed cast.
         CASE WHEN layer.sampling_date ~ '^[0-9]{4}' THEN LEFT(layer.sampling_date, 4)::int END,
         layer.min_depth,
         layer.max_depth,
         layer.horizon,
         layer.sampling_date,
         lab_method.name,
         obs.value::float8
       FROM ${schema}.dataset_layers dl
       INNER JOIN ${schema}.datasets ds ON ds.id = dl.dataset_id
       INNER JOIN ${schema}.layers layer ON layer.id = dl.layer_id
       INNER JOIN ${schema}.soil_properties sp ON sp.id = dl.soil_property_id AND sp.deleted_at IS NULL
       LEFT JOIN ${schema}.licenses license ON license.id = layer.license AND license.deleted_at IS NULL
       INNER JOIN ${schema}.observations obs ON obs.dataset_layer_id = dl.id
       LEFT JOIN ${schema}.procedures procedure ON procedure.id = obs.procedure_id AND procedure.deleted_at IS NULL
       LEFT JOIN ${schema}.vocabulary lab_method ON lab_method.id = procedure.laboratory_method_id
         AND lab_method.category = 'laboratory_method' AND lab_method.deleted_at IS NULL
       WHERE dl.feature_id = ANY(ARRAY(SELECT DISTINCT feature_id FROM sst_unit_features)::uuid[])
         AND ds.deleted_at IS NULL
         AND ds.status = 'PUBLISHED'
         AND ds.gis_datatype <> '${GISDataType.RASTER}'
         AND ds.slug IN (${slugPlaceholders})
         ${whereClauses.length > 0 ? `AND ${whereClauses.join('\n         AND ')}` : ''}`,
      params,
    );
    await em.query('CREATE INDEX ON sst_obs (feature_id)');
    await em.query('CREATE INDEX ON sst_obs (dataset_slug, soil_property_slug)');
    await em.query('ANALYZE sst_obs');
    await progress('Collected observations', 45);
    await checkCancelled();

    // ── stage 3a: overall, per (dataset, soil property), Observations counted once ──
    const overallRows: (RawCell & { dataset_slug: string; soil_property_slug: string; standard_unit: string | null })[] = await em.query(`
        SELECT o.dataset_slug, o.soil_property_slug, o.standard_unit, ${CELL_METRICS}
        FROM sst_obs o
        GROUP BY o.dataset_slug, o.soil_property_slug, o.standard_unit`);

    if (overallRows.length === 0) {
      return { results: [], truncated: false };
    }

    const overallHist = groupHistogramRows(
      await em.query(
        histogramSql(
          [
            { expr: 'o.dataset_slug', alias: 'dataset_slug' },
            { expr: 'o.soil_property_slug', alias: 'soil_property_slug' },
          ],
          false,
          '$1',
          '$2',
          '',
        ),
        [histogramBins, MIN_HISTOGRAM_COUNT],
      ),
      ['dataset_slug', 'soil_property_slug'],
    );
    await progress('Computed overall statistics', 60);
    await checkCancelled();

    // ── stage 3b: L1, per (dataset, soil property, unit) — always complete ────────
    const l1Rows: (RawCell & { unit_id: string; dataset_slug: string; soil_property_slug: string })[] = await em.query(`
      SELECT uf.unit_id, o.dataset_slug, o.soil_property_slug, ${CELL_METRICS}
      FROM sst_obs o
      ${UNIT_FAN_OUT}
      GROUP BY uf.unit_id, o.dataset_slug, o.soil_property_slug`);

    const l1Hist = groupHistogramRows(
      await em.query(
        histogramSql(
          [
            { expr: 'uf.unit_id', alias: 'unit_id' },
            { expr: 'o.dataset_slug', alias: 'dataset_slug' },
            { expr: 'o.soil_property_slug', alias: 'soil_property_slug' },
          ],
          true,
          '$1',
          '$2',
          '',
        ),
        [histogramBins, MIN_HISTOGRAM_COUNT],
      ),
      ['unit_id', 'dataset_slug', 'soil_property_slug'],
    );
    await progress('Computed per-unit statistics', 75);
    await checkCancelled();

    // ── stage 3c: L4 budget ──────────────────────────────────────────────────────
    // Costed before it is fetched, so an over-budget group is never materialised only
    // to be discarded. Groups are admitted all-or-nothing in a deterministic order:
    // a flat cut through sorted cells would truncate whichever datasets sort last and
    // leave the output looking complete for the rest (docs/adr/0021).
    //
    // `HAVING COUNT(*) > 1` costs only what will actually be emitted: a unit holding a
    // single cell reports no breakdown (see stage 3d), so charging the budget for it would
    // truncate a neighbouring group to make room for output that is never produced.
    const groupCosts: { dataset_slug: string; soil_property_slug: string; cells: number }[] = await em.query(`
      SELECT u.dataset_slug, u.soil_property_slug, SUM(u.cells_in_unit)::int AS cells
      FROM (
        SELECT g.unit_id, g.dataset_slug, g.soil_property_slug, COUNT(*) AS cells_in_unit
        FROM (
          SELECT DISTINCT uf.unit_id, o.dataset_slug, o.soil_property_slug, o.year, o.min_depth, o.max_depth
          FROM sst_obs o
          ${UNIT_FAN_OUT}
        ) g
        GROUP BY g.unit_id, g.dataset_slug, g.soil_property_slug
        HAVING COUNT(*) > 1
      ) u
      GROUP BY u.dataset_slug, u.soil_property_slug
      ORDER BY u.dataset_slug, u.soil_property_slug`);

    const included: { dataset_slug: string; soil_property_slug: string }[] = [];
    const excludedGroups = new Set<string>();
    let budget = maxCells;
    for (const group of groupCosts) {
      if (group.cells <= budget) {
        included.push({ dataset_slug: group.dataset_slug, soil_property_slug: group.soil_property_slug });
        budget -= group.cells;
      } else {
        excludedGroups.add(keyOf(group.dataset_slug, group.soil_property_slug));
      }
    }
    const truncated = excludedGroups.size > 0;
    if (truncated) {
      log.warn('Soil statistics breakdown truncated', {
        max_cells: maxCells,
        omitted_groups: excludedGroups.size,
        included_groups: included.length,
      });
    }

    // ── stage 3d: L4, per (dataset, soil property, unit, year, depth interval) ────
    let l4Rows: (RawCell & {
      unit_id: string;
      dataset_slug: string;
      soil_property_slug: string;
      year: number | null;
      min_depth: number | null;
      max_depth: number | null;
    })[] = [];
    let l4Hist = new Map<string, Map<number, number>>();

    if (included.length > 0) {
      const l4Params: any[] = [];
      const lp = (val: any) => {
        l4Params.push(val);
        return `$${l4Params.length}`;
      };
      const groupFilter = `WHERE (o.dataset_slug, o.soil_property_slug) IN (${included
        .map(g => `(${lp(g.dataset_slug)}, ${lp(g.soil_property_slug)})`)
        .join(', ')})`;

      // A unit whose Observations all fall in one (year, depth interval) cell is skipped
      // here rather than assembled and then discarded: with a single partition that cell
      // covers exactly the rows behind the unit's own statistics, so every figure in it —
      // including the histogram — would repeat the unit cell verbatim. The window count
      // runs after the GROUP BY, so it counts cells per unit, not Observations.
      l4Rows = await em.query(
        `SELECT * FROM (
           SELECT uf.unit_id, o.dataset_slug, o.soil_property_slug, o.year, o.min_depth, o.max_depth, ${CELL_METRICS},
             COUNT(*) OVER (PARTITION BY uf.unit_id, o.dataset_slug, o.soil_property_slug) AS cells_in_unit
           FROM sst_obs o
           ${UNIT_FAN_OUT}
           ${groupFilter}
           GROUP BY uf.unit_id, o.dataset_slug, o.soil_property_slug, o.year, o.min_depth, o.max_depth
         ) cell
         WHERE cell.cells_in_unit > 1`,
        l4Params,
      );

      const histParams: any[] = [histogramBins, MIN_HISTOGRAM_COUNT];
      const hp = (val: any) => {
        histParams.push(val);
        return `$${histParams.length}`;
      };
      const histGroupFilter = `WHERE (o.dataset_slug, o.soil_property_slug) IN (${included
        .map(g => `(${hp(g.dataset_slug)}, ${hp(g.soil_property_slug)})`)
        .join(', ')})`;
      l4Hist = groupHistogramRows(
        await em.query(
          histogramSql(
            [
              { expr: 'uf.unit_id', alias: 'unit_id' },
              { expr: 'o.dataset_slug', alias: 'dataset_slug' },
              { expr: 'o.soil_property_slug', alias: 'soil_property_slug' },
              { expr: 'o.year', alias: 'year' },
              { expr: 'o.min_depth', alias: 'min_depth' },
              { expr: 'o.max_depth', alias: 'max_depth' },
            ],
            true,
            '$1',
            '$2',
            histGroupFilter,
          ),
          histParams,
        ),
        ['unit_id', 'dataset_slug', 'soil_property_slug', 'year', 'min_depth', 'max_depth'],
      );
    }
    await progress('Computed breakdown', 90);

    // ── assemble ─────────────────────────────────────────────────────────────────
    const breakdownByUnit = new Map<string, BreakdownCell[]>();
    for (const row of l4Rows) {
      const histKey = keyOf(row.unit_id, row.dataset_slug, row.soil_property_slug, row.year, row.min_depth, row.max_depth);
      const cell = toBreakdownCell(row, histogramBins, l4Hist.get(histKey) ?? new Map());
      const key = keyOf(row.dataset_slug, row.soil_property_slug, row.unit_id);
      const list = breakdownByUnit.get(key);
      if (list) list.push(cell);
      else breakdownByUnit.set(key, [cell]);
    }
    for (const list of breakdownByUnit.values()) {
      list.sort(
        (a, b) => (a.year ?? -1) - (b.year ?? -1) || (a.min_depth ?? -1) - (b.min_depth ?? -1) || (a.max_depth ?? -1) - (b.max_depth ?? -1),
      );
    }

    const unitsByGroup = new Map<string, UnitStatistics[]>();
    for (const row of l1Rows) {
      const groupKey = keyOf(row.dataset_slug, row.soil_property_slug);
      // Absent, not empty: nothing was computed for this unit's breakdown, either because
      // the group is over budget or because its one cell would repeat the unit cell.
      const breakdown = breakdownByUnit.get(keyOf(row.dataset_slug, row.soil_property_slug, row.unit_id));
      const unit: UnitStatistics = {
        unit_id: row.unit_id,
        ...toCell(row, histogramBins, l1Hist.get(keyOf(row.unit_id, row.dataset_slug, row.soil_property_slug)) ?? new Map()),
        ...(breakdown ? { breakdown } : {}),
      };
      const list = unitsByGroup.get(groupKey);
      if (list) list.push(unit);
      else unitsByGroup.set(groupKey, [unit]);
    }

    const results: SoilStatisticsResult[] = overallRows
      .map(row => {
        const groupKey = keyOf(row.dataset_slug, row.soil_property_slug);
        return {
          dataset_id: row.dataset_slug,
          soil_property: row.soil_property_slug,
          standard_unit: row.standard_unit,
          l4_included: !excludedGroups.has(groupKey),
          overall: toCell(row, histogramBins, overallHist.get(groupKey) ?? new Map()),
          units: (unitsByGroup.get(groupKey) ?? []).sort((a, b) => a.unit_id.localeCompare(b.unit_id)),
        };
      })
      .sort((a, b) => a.dataset_id.localeCompare(b.dataset_id) || a.soil_property.localeCompare(b.soil_property));

    log.info('Soil statistics computed', {
      groups: results.length,
      units: unitIds.length,
      raster_filtered: usesMatchingFeatures,
      truncated,
    });

    return { results, truncated };
  });
};

export const computeSoilStatisticsTimed = (entityManager: EntityManager, options: SoilStatisticsOptions) =>
  timed('soilStatistics.compute', () => computeSoilStatistics(entityManager, options));
